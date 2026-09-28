const fs=require('node:fs/promises');const path=require('node:path');
class ViewingSettings {
 constructor(file){this.file=file;}
 async load(){try{return JSON.parse(await fs.readFile(this.file,'utf8'));}catch{return {bookmarkShortcut:'CommandOrControl+Shift+S'};}}
 async save(value){if(typeof value.bookmarkShortcut!=='string'||value.bookmarkShortcut.length>100||!value.bookmarkShortcut.trim())throw Error('Raccourci invalide.');await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file,JSON.stringify({bookmarkShortcut:value.bookmarkShortcut}),{mode:0o600});return value;}
}
module.exports={ViewingSettings};
