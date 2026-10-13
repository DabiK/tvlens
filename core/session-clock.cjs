class SessionClock {
 // A reopened session starts at its archived instant; paused, time only runs again after resume().
 constructor(read,{elapsedMs=0,paused=false}={}){this.read=read;this.accumulated=Number.isFinite(elapsedMs)&&elapsedMs>0?elapsedMs:0;this.started=paused?null:read();}
 now(){return this.accumulated+(this.started===null?0:this.read()-this.started);}
 pause(){if(this.started!==null){this.accumulated=this.now();this.started=null;}}
 resume(){if(this.started===null)this.started=this.read();}
}
module.exports={SessionClock};
