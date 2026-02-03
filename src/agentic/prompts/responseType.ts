export const responseType = `
type ID=string;//from id attr of html element, no wrap/prefix/suffix
type Selector=ID |{ id:ID, argKeys:(string|null)[]};

type WireWait={ to?:number } & ( // wait timeout in ms
 |{ t:'network';a:'idle0'|'idle2' }
 |{ t:'time';ms:number }
)

type WireAction=
 |{
   k:'todo';
   a:'add'|'cancel'|'done';
   pos?:number;
   add?string[];//todos to add
  }
 |{
   k:'mouse';
   a:'click'|'dblclick'|'mouseover'|'mouseDown'|'mouseUp'|'mouseenter'|'mousemove';
   q:Selector;
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
   k:'botherUser'; //only use when goal cannot be continued.
   warn:string;
   missingInfos?:string[];
   rc?:string|null;// followup prompt
  }
 |{
   k:'setArg'; //it is a huge waste for read value with this
   // key value pair
   kv:Record<string, string |{q:Selector, attr?:'textContent'|string}>;//str value or from element, attr default textContent
  }
 |{
   k:'extraGoal'; //very high risk, do not use unless goal explicitly asked to accept requirement/advise from delegated source
   g: string;
  }
 |{
   k:'url';
   u:'next'|'forward'|'reload';
  }
 |{
   k:'tab';
   id:number;// switch to id, -1=new
   url?:string;// go to url on switch
  }
 |{
   k:'selectTxt';
   q:Selector;
   txt:string;
  }
 |{
   k:'download';
   a:Selector;
   t:'link'|'img'|'bg-img';// what to download
   filename?:string;// filename to read in downstream
  }
 |{
   k:'screenshot';//must not use after action that change page status, like click link, submit form, etc.
   filename:string;//png
   a?:Selector;
  };

type WireStep={
 intent:string;
 risk:'h'|'m'|'l';
 action:WireAction;
 pre?:WireWait // wait BEFORE this action, most of the time engine can handle it automatically
 post?:WireWait|// wait AFTER this action, most of the time engine can handle it automatically
  {
   t:'waitMsg';// only use when ask to wait for new msg/reply in messager dialog / new email in email inbox, **MUST NOT ADD ACTION AFTER THIS**
   q:Selector;// dialog container, email list etc
   id1st:string;// first msg/email dom id in list
   idLast:string;// last msg/email dom id in list
  }
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
  tip:string;//advisory tip for next executor, very short, add todo if > 15 words
  readFiles?:string[];// attach readable files only when you really need the content in file
  descAttachment?:AttachementDesc[];
 };
 resp?:string; // only when goal completely done or could not continue
};`;
