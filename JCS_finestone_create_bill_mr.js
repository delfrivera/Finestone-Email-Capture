/**
 *@NApiVersion 2.0
 *@NScriptType MapReduceScript
 */

define([
    'N/record',
    'N/file',
    'N/log',
    'N/transaction',
    'N/render',
    'N/runtime',
    'N/search',
    'N/task',
    'N/format',
    'N/email',
    'N/error',
    './JCS_finestone_email_capture_util.js'
    ],
    
    function (
    record,
    file,
    log,
    transaction,
    render,
    runtime,
    search,
    task,
    format,
    email,
    error,
    util){
    
        var scriptObj = runtime.getCurrentScript();
        var EMAILSEARCHID = util.SEARCHID().EMAILSEARCHID;
        var CUSTRECORDTYPE = 'customrecord_supplier_bill_capture';
        function getInputData(){

            //Retrieve Records to Process
            var fltrs = {};
            var results = util.loadSearch(EMAILSEARCHID, null, fltrs); // SearchID, RecordType, filters
    
            if (util.isEmpty(results)){
                log.debug({
                    title : 'results empty',
                    details : results
                });
    
                return null;
            }
    
            results =  FormatResults(results);
            
            log.debug({
                title : 'formatted results',
                details : JSON.stringify(results)
            });
            
            return results;
        }
    
        function FormatResults(results){
        try{
            var obj = {};
            for (each in results){
                var id = results[each].id;
                var files = {};
                files.csv = results[each].getValue('custrecord_csv_file_capture');
                files.pdf = results[each].getValue('custrecord_pdf_file_capture');
                obj[id] = files;
            }

            return obj;
        }catch (ex){
        log.debug({
            title : 'FormatResults Ex',
            details : ex
        });
        }
        }
    
        function map(context){
        try{
            var obj = JSON.parse(context.value);
            log.debug('map', context.key + ' : ' + JSON.stringify(obj));
            var recId = context.key;
            var formattedObj = CSVtoJSON(obj);
            if (util.isEmpty(formattedObj)) return; 
            CreateBill(recId,formattedObj);
            //CreateInvoice(formattedObj);
    
        }catch (ex){
        log.debug({
            title : 'map Ex',
            details : ex
        });
        }
        }

        /**
         * 
         * @param {integer} id custom record internal id
         * @param {string} type processed,failed,processing
         * @param {string} ex error that transpired
         */
        function SetRecStatus(id,type,logmsg){
        try{
            if (!util.isEmpty(logmsg))
                logmsg = logmsg.code + ' : '+logmsg.message;

            var status = new util.STATUS()[type];
            record.submitFields({
                type: CUSTRECORDTYPE,
                id: id,
                values: {
                    'custrecord_status_capture': status,
                    'custrecord_log_area_capture' : logmsg
                }
            });

            log.debug({
                title : 'STATUS[type]',
                details : 'ID: '+id+' status: '+ status
            });
            
            
        }catch (ex){
            log.debug({
                title : 'SetRecStatus Ex',
                details : ex
            });
            }
        }

        function CSVtoJSON(obj){
        try{
            var csv = obj.csv;
            var pdf = obj.pdf;

            var LINEMAP = new util.LINEMAP();
            var fileObj = file.load({
                id: csv
            });
            var filecontents = fileObj.getContents();
            
            filecontents = filecontents.split("\n");
            var lineCount = filecontents.length;
            log.debug({
                title : 'lineCount',
                details : lineCount
            });
            var formattedObj = {};
            var hasValue = false;
            for (var x=1; x<lineCount; x++){ //idx starts at 1 to exclude csv header
                var line = filecontents[x].split(',');
                if (formattedObj[line[LINEMAP.ordernumber]]==undefined)
                    formattedObj[line[LINEMAP.ordernumber]] = {};

                if (formattedObj[line[LINEMAP.ordernumber]][line[LINEMAP.product]]==undefined)
                    formattedObj[line[LINEMAP.ordernumber]][line[LINEMAP.product]] = [];

                var abn = line[LINEMAP.abn];
                if (!util.isEmpty(abn))
                    abn = abn.replace(/(\r\n|\n|\r)/gm, "");

                var desc = line[LINEMAP.desc];
                if (!util.isEmpty(desc))
                    desc = desc.replace(/(\r\n|\n|\r)/gm, "");

                var itemObj = {};
                itemObj.qty = line[LINEMAP.qty];
                itemObj.gstgross = line[LINEMAP.gstgross];
                itemObj.gst = line[LINEMAP.gst];
                itemObj.abn = abn;
                itemObj.desc = desc;
               
                formattedObj[line[LINEMAP.ordernumber]][line[LINEMAP.product]].push(itemObj);
                if (!hasValue)
                    hasValue = true;
            }
            log.debug({
                title: 'CSVtoJSON',
                details: JSON.stringify(formattedObj)
            })

            if (!hasValue) return null;

            return formattedObj;
            
        }catch (ex){
        log.debug({
            title : 'CSVtoJSON Ex',
            details : ex
        });
        }
        }
    
        /**
         * 
         * @param {number} recId custom record internal id
         * @param {JSON} obj json containing PO details from CSV
         */
        function CreateBill(recId,obj){
        try{
            SetRecStatus(recId,'PROCESSING',null);
            var ponum = null;
            var poObj= {};
            for (each in obj){
                ponum = each;
                var inner = obj[each];
                for ( i in inner){
                    poObj[i] = inner[i];
                }
            }

            if (util.isEmpty(ponum)) return;
            var povals = GetPO(ponum);  if (util.isEmpty(povals.poid)) return;

            //log.debug({title: 'vendor id',details:povals.entity});

            var billRec = record.transform({
                fromType: record.Type.PURCHASE_ORDER,
                fromId: povals.poid,
                toType: record.Type.VENDOR_BILL,
                isDynamic : true
            });
    
            var ITEMIDLIST = SearchItemId(obj);
    
            if (util.isEmpty(ITEMIDLIST)) return;

            var recLines = billRec.getLineCount({
                sublistId: 'item'
            });
            
            var idx = 0;
            for (var z=0; z<recLines; z++){

                billRec.selectLine({
                    sublistId: 'item',
                    line: z
                });

                billRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: 0,
                    ignoreFieldChange: true
                });

                billRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'rate',
                    value: 0,
                    ignoreFieldChange: true
                });

                billRec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'amount',
                    value: 0,
                    ignoreFieldChange: true
                });

                billRec.commitLine({
                    sublistId: 'item'
                });
                idx++;
            }
            
            log.debug({
                title: 'CreateBill',
                details: 'BEGIN NEW LINES'
            });
            //add new lines
            for (i in poObj){
                log.debug({
                    title: 'poObj[i]',
                    details: poObj[i]
                });

                var len = poObj[i].length;
                if (util.isEmpty(len)) continue;
                var itemid = ITEMIDLIST[i];
                
                var lines = poObj[i];
                for (k=0;k<len;k++){
                    billRec.selectLine({
                        sublistId: 'item',
                        line: idx
                    });

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: itemid,
                        ignoreFieldChange: true
                    });

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'description',
                        value: lines[k].desc,
                        ignoreFieldChange: true
                    });

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: lines[k].qty,
                        ignoreFieldChange: true
                    });

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'taxcode',
                        value: 7,
                        ignoreFieldChange: true
                    });

                    var taxamt = parseFloat(lines[k].gst);
                    log.debug({
                        title: 'taxamt',
                        details: taxamt
                    });

                    if (isNaN(taxamt)) taxamt = 0;

                    var grossamt = parseFloat(lines[k].gstgross);
                    log.debug({
                        title: 'grossamt',
                        details: grossamt
                    });
                    if (isNaN(grossamt)) grossamt = 0;

                    var rate = grossamt - taxamt;
                    log.debug({
                        title: 'rate',
                        details: rate
                    });
                    rate = parseFloat(rate);

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        value: rate,
                        ignoreFieldChange: true
                    });

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'tax1amt',
                        value: taxamt,
                        ignoreFieldChange: true
                    });

                    billRec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'amount',
                        value: grossamt,
                        ignoreFieldChange: true
                    });

                    billRec.commitLine({
                        sublistId: 'item'
                    });
                    idx++;
                }
            }
            
            
            try {

                billRec.save();
                var billId = billRec.id;
                SetRecStatus(recId,'PROCESSED',null);
                
                log.debug({
                    title: 'CreateBill Success',
                    details: 'id: ' + billId+', updated PO!'
                });
    
                ClosePO(povals.poid,billId);

            } catch (exsave) {
                SetRecStatus(recId,'FAILED',exsave);
                log.debug({
                    title: 'CreateBill inner ex',
                    details: exsave
                });

                return;
            }

        }catch (ex){
            SetRecStatus(recId,'FAILED',ex);
            log.debug({
                title : 'CreateBill Ex',
                details : ex
            });
            }
        }
        
        function ClosePO(id,billid){
        try{
            var porec = record.load({
                type: record.Type.PURCHASE_ORDER, 
                id: id,
                isDynamic: true,
            });

            var recLines = porec.getLineCount({
                sublistId: 'item'
            });
            
            for (var z=0; z<recLines; z++){
                porec.selectLine({
                    sublistId: 'item',
                    line: z
                });

                porec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'isclosed',
                    value: true
                });

                porec.commitLine({
                    sublistId: 'item'
                });
            }
            
            porec.save({
                ignoreMandatoryFields: true
            });

            log.debug({
                title: 'PO Closed',
                details: 'id: ' + porec.id
            });
            
        }catch (ex){
            log.debug({title:'UpdateInvoice Exception',details: ex});
        }
        }

        /**
         * 
         * @param {json} obj  
         */
        function SearchItemId(obj){
        try{
            var y = [];
            for (each in obj){
                for (itemid in obj[each]){
                //console.log(itemid);
                if (y.indexOf(itemid)!=-1) continue;
                y.push(itemid);
                }
            }

            if (util.isEmpty(y)) return null;
            
            var nameflter = [];
            for (each in y){
                nameflter.push(["name","haskeywords",y[each]]);
                if (each!=y.length-1)
                    nameflter.push("OR");
            }

            log.debug({
                title: 'nameflter',
                details: nameflter
            });

            var res = search.create({
                type: "noninventoryresaleitem",
                filters:
                [
                   ["type","anyof","NonInvtPart"], 
                   "AND", 
                   ["subtype","anyof","Resale"], 
                   "AND", 
                   nameflter
                ],
                columns:
                [
                   search.createColumn({
                      name: "itemid",
                      sort: search.Sort.ASC
                   }),
                   "displayname",
                   "salesdescription",
                   "baseprice"
                ]
             });

             var searchResultCount = res.runPaged().count;
             var itemids = {};
             res.run().each(function(result){
                // .run().each has a limit of 4,000 results
                itemids[result.getValue('itemid')] = result.id;
                return true;
             });

             log.debug({
                title : 'itemids',
                details : JSON.stringify(itemids)
            });
            
            return itemids;
        }catch (ex){
            log.debug({
                title : 'SearchItemId Ex',
                details : ex
            });
            }
            return null;
        }

        function GetPO(ponum){
        try{
            var res = search.create({
                type: "purchaseorder",
                filters:
                [
                   ["type","anyof","PurchOrd"], 
                   "AND", 
                   ["mainline","is","T"], 
                   "AND", 
                   ["tranid","anyof",ponum]
                ],
                columns:
                [
                   "tranid",
                   "entity"
                ]
             });
             var cnt = res.runPaged().count;
             log.debug({
                title : 'cnt',
                details : JSON.stringify(cnt)
            });
             if (util.isEmpty(cnt)) return null;
             
             var povals = {};
             res.run().each(function(result){
                 povals.poid = result.id;
                 povals.entity = result.getValue('entity');
                return;
             });
             
             log.debug({
                title : 'povals',
                details : povals
            });

            return povals;

        }catch (ex){
        log.debug({
            title : 'GetPO Ex',
            details : ex
        });
        }
        }

    
        function reduce(){
    
        }
    
        function summarize(){
    
        }
    
        return {
            getInputData : getInputData,
            map : map,
            reduce : reduce,
            summarize : summarize
        }
    }
    );