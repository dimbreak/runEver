export const responseType = `
type ID=string;//from id attr of html element, no wrap/prefix/suffix
type Selector=ID |{ id:ID, argKeys:(string|null)[]};

type WireWait={ to?:number } & ( // wait timeout in ms
 |{ t:'net';a:'idle0'|'idle2' }
 |{ t:'time';ms:number }
)

type WireAction=
 |{
   k:'addNewTask';//for adding check point for **dynamic new task** in workflow only
   afterCpId?:number;//add after check point
   checkPoints:string[];//new checkPoints to add
   permitFromGoal:string;//sub-string in [GOAL] where allows you to add new task
   src:string;//source of task
   taskRisk:'l'|'m'|'h';//MUST FOLLOW [risk rules], will auto botherUser in certain level
  }
 |{
   k:'checklist';
   a:'working';//use action.cp to save token
   pos:number;
   rework?:boolean;//if rework verified
  }
 |{
   k:'checklist';
   a:'cancel';
   pos:number;
   cancelReason?:string;
  }
 |{
   k:'checklist';
   a:'verified';//check it seriously, only apply to working check point
   pos:number;
   verifiedProve?:{
     domId:string;
     proveOfWork:string;//short desc on what have you done, and did you get info to continue?;
   }
  }
 |{
   k:'mouse';
   a:'click'|'dblclick'|'mouseover'|'mouseDown'|'mouseUp'|'mouseenter'|'mousemove';
   q:Selector;//always on leaf el
   repeat?:number;
  }
 |{
   k:'scroll';
   to:Selector|[number/*x*/, number/*y*/];
   over?:Selector;// default to window
  }
 |{
   k:'focus';
   q:Selector;
  }
 |{
   k:'dragAndDrop';
   sq:Selector;// src QuerySelector
   dq?:Selector;// dst QuerySelector
   mv?:{ x:number;y:number }|null;
  }
 |{
   k:'key';
   key:string;// single key, use input for typing words
   a:'keyDown'|'keyUp'|'keyPress';//always use press for typing, unless required/need delay
   q?:Selector;
   c?:boolean;// ctrl
   al?:boolean;// alt
   s?:boolean;// shift
   m?:boolean;// meta
   repeat?:number;
  }
 |{
   k:'input';// for input, textarea, contentEditable, select, also upload file with path in v
   q:Selector;
   v:string|string[];// input value, array for multiple select/files
   c?:'noClear';// without this will clear before typing
  }
 |{
   k:'botherUser'; //only use when goal cannot be continued with trial & observe
   warn:string;
   missingInfos?:string[];
   rc?:string|null;// followup prompt
  }
 |{
   k:'setArg'; //it only add kv to [arguments], would not read/do anything else
   // key value pair
   kv:Record<string, string |{q:Selector, attr?:'textContent'|string}>;//str value or from element, attr default textContent
  }
 |{
   k:'url';
   u:'next'|'forward'|'reload';
  }
 |{
   k:'tab';//will skip actions after this, no action after this
   id:number;// switch to id, -1=new
   url?:string;// go to url on switch
   noteBeforeLeave:string;//tell what you did in current tab
  }
 |{
   k:'selectTxt';
   q:Selector;
   txt:string;
  }
 |{
   k:'download';//for link/button use click
   a:Selector;//no button
   t:'link'|'img'|'bg-img';// what to download, no button
   filename?:string;// filename to read in downstream
  }
 |{
   k:'screenshot';//must not use without wait after action that change page status, like click link, submit form, etc.
   filename:string;//png
  };

type WireStep={
 intent:string;//short, < 8 words
 risk:'h'|'m'|'l';
 action:WireAction;
 pre?:WireWait // wait BEFORE this action, most of the time engine can handle it automatically
 post?:WireWait|// wait AFTER this action, most of the time engine can handle it automatically
  {
   didGoalAskYouToWaitInNoCondition:string;//explain shortly, will be no if it requires anything before
   didYouSendMsgBeforeWaitReply:string;//explain shortly, not yet/planned means no! stay away!
    // only use to **wait** for new msg/reply in messager dialog / new email in email inbox, **MUST NOT ADD ACTION AFTER THIS**, only use with mouse/key/focus action
   t:'blockHereAndWaitForNewIncomingMsg';//only block for 1 of 2 reasons, answer above, you may stop here if no solid yes! just leave q: null
   q:Selector;// only apply to dialog container, email list etc, must seen the list before apply
   id1st:string;// first msg/email dom id in list
   idLast:string;// last msg/email dom id in list
  }
  cp?:number[];//bind to check point and set to working
  unverify?:boolean;//need true if the check point in verify status
}

type AttachementDesc={
 name:string;
 desc:string;
};

type LlmWireResult={
 a:WireStep[];// steps
 e?:string;// error
 next?:{
  sc?:boolean;// require screenshot
  tip:string;//very short advisory tip just 1-2 steps < 16 words, for keeping status use addNewTask
  readFiles?:string[];//attach readable files only when you really need the content in file, unnecessary reading is harmful
  descAttachment?:AttachementDesc[];//desc for added info only, can omit, key data to [GOAL] should setArg
 };
 endSess?:string;//only when the task ends abnormally
}`;
