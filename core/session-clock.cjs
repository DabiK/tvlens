class SessionClock {
 constructor(read){this.read=read;this.accumulated=0;this.started=read();}
 now(){return this.accumulated+(this.started===null?0:this.read()-this.started);}
 pause(){if(this.started!==null){this.accumulated=this.now();this.started=null;}}
 resume(){if(this.started===null)this.started=this.read();}
}
module.exports={SessionClock};
