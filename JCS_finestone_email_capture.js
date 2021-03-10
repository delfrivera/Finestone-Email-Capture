/**
 *  JCS Email Plug-in
 *
 */

var RECORDTYPE = 'customrecord_supplier_bill_capture';
var FOLDERID = 4391;//Pending/Failed folder
var STATUS = 1; //Default is Pending

function process(email) {
	try{

		var obj = EmailObject(email);
		var files = CreateFiles(obj);
		if (files){
			for (each in files){
				obj[each] = files[each];
			}
		}
		CreateRecord(obj);
		
	}catch(ex){	
		nlapiLogExecution('ERROR','process:',ex.message);	
	}
}

function CreateFiles(obj){
try{
	var attachments = obj.attachments;
	var files = {};
	if (attachments){
		for (var a in attachments){
			var filename = attachments[a].getName();
			var filetype = attachments[a].getType();
			var val = attachments[a].getValue();
			try{
				if (filetype == 'MISCBINARY'){
					val = Base64.decode(val);
					filetype = 'CSV';
				}
				
				nlapiLogExecution('Debug',filetype,filename);
				
				var file = nlapiCreateFile(filename, filetype.toUpperCase(), val);
				file.setFolder(FOLDERID); 
				var fileid = nlapiSubmitFile(file);	
				nlapiLogExecution('Debug','CreateFile success',filename+' - file id: '+fileid);
				
				files[filetype] = fileid;
			}catch(innerex){	
				nlapiLogExecution('ERROR','innerex createfiles:',innerex.message);
			}
		}

		nlapiLogExecution('ERROR','files :',JSON.stringify(files));
		return files;
	}

}catch(ex){	
	nlapiLogExecution('ERROR','CreateFiles:',ex.message);
	return null;
}
}

function EmailObject(email){
	var obj = {};
	obj.from = email.getFrom();
	obj.to = email.getTo();
	obj.cc = email.getCc();
	obj.attachments = email.getAttachments();
	obj.subject = email.getSubject();
	obj.txtBody = email.getTextBody();
	obj.htmlBody = email.getHtmlBody();
	obj.replyTo = email.getReplyTo();
	obj.date = email.getSentDate();
	obj.status = STATUS;
	obj.CSV = null;
	obj.PDF = null;
	return obj;
}

function FieldMap(){
	var obj = {};
	obj.from = 'custrecord_sender_email_capture';
	obj.subject = 'custrecord_subject_capture';
	obj.date = 'custrecord_date_capture';
	obj.status = 'custrecord_status_capture';
	obj.CSV = 'custrecord_csv_file_capture';
	obj.PDF = 'custrecord_pdf_file_capture';
	return obj;
}

function CreateRecord(obj){
try{
	var rec = nlapiCreateRecord(RECORDTYPE);
	var fldMap = new FieldMap();
	for (fld in fldMap){
		rec.setFieldValue(fldMap[fld],obj[fld]);
	}
	var id = nlapiSubmitRecord(rec,true,true);
	nlapiLogExecution('ERROR','CreateRecord:',id);	

}catch(ex){	
	nlapiLogExecution('ERROR','CreateRecord:',ex.message);	
}
}