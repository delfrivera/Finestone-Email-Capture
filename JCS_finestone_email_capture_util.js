/**
* Library
*/

define([
	'N/record',
	'N/log',
	'N/transaction',
	'N/search',
	'N/format',
	'N/runtime'],
	Main);
	
	function Main(
	record,
	log,
	transaction,
	search,
	format,
	runtime){

		var scriptObj = runtime.getCurrentScript();
	
		function SEARCHID(){
			var obj = {};
			obj.EMAILSEARCHID = 'customsearch_jcs_bill_email_capture';
			return obj;
		}
		
		/**
		* id : searchid
		* type : recordtype
		* fltrs : search filters array
		*/
		function loadSearch(id,type,fltrs){
		try{
			var mySearch = search.load({
				id: id,
				type: type
			});
			
			if (!isEmpty(fltrs)){
				for (each in fltrs){
					log.debug({title:'UTIL : fltr',details:fltrs[each]});
					mySearch.filters.push(fltrs[each]);
				}
			}
	
			var results = mySearch.run().getRange(0, 1000);
			if(isEmpty(results)) return null;
			var completeResultSet = results; //copy the results
			var start = 1000;
			var last = 2000;
			//if there are more than 1000 records
			while(results.length == 1000){
				results = mySearch.run().getRange(start_range, last_range);
				completeResultSet = completeResultSet.concat(results);
				start = parseFloat(start)+1000;
				last = parseFloat(last)+1000;
			}
	
			results = completeResultSet;
			//log.debug({title: 'results length',details: results.length,});
			
			return results;
		}catch(ex){log.debug({title:'loadSearch Exception',details:ex});
		}
		}
	
		function isEmpty(val) {
			if (val==null || val== 'null' ||val==undefined||val=='' ||val==' ' ||val==0 ||val=='undefined' ||val==='undefined' ||val===undefined) {
				return true;
			}
			return false;
		}
		
		/***
		 * id : search id
		 * type : record type
		 */
		function getSearchColumns(id,type){	
			var mySearch = search.load({
					id: id,
					type : type
				});
				
			var cols = mySearch.columns;
			
			return cols;
		}
	
		/***
		 * rec : each record in search results
		 * cols : search columns
		 * col : search column index
		 */
		function getColumnValue(rec, cols, col) {
			if (isEmpty(col)) return null;
			var val = rec.getText(cols[col]);
			if (isEmpty(val))
				val = rec.getValue(cols[col]);
			return val;
		}

		function getLocalDate(date){
		try{			
            var localDate = format.format({
                value: date, 
                type: format.Type.DATETIME, 
                timezone: format.Timezone.ASIA_KUALA_LUMPUR   
			});

			return localDate;
		}catch (ex){
			log.debug({
				title : 'getLocalDate Ex',
				details : ex
			});
		}
		}
	
		
        function LINEMAP(){
            var obj = {};
			obj.supplier = 0;
			obj.date = 1;
			obj.branch = 3;
			obj.number = 4;
			obj.ordernumber = 5;
			obj.jobname = 6;
			obj.receiver = 7;
			obj.product = 8;
			obj.desc = 9;
			obj.qty = 10;
			obj.unit = 11;
			obj.gstgross = 12;
			obj.gst = 13;
			obj.total = 14;
			obj.disc = 15;
			obj.abn = 16;
			return obj;
		}

		function STATUS(){
			var obj = {};
			obj.PENDING = 1;
			obj.PROCESSING = 2;
			obj.FAILED = 3;
			obj.PROCESSED = 4;
			return obj; 
		}
		
		return {
			isEmpty : isEmpty,
			loadSearch : loadSearch,
			getSearchColumns : getSearchColumns,
			getColumnValue : getColumnValue,
			getLocalDate : getLocalDate,
			SEARCHID : SEARCHID,
			LINEMAP : LINEMAP,
			STATUS : STATUS
		};
	}