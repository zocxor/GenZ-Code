// SDK 54 Metro expects the legacy default image-size export. Version 2 patches
// parser denial-of-service vulnerabilities; adapt both buffer and legacy path calls.
const fs=require('node:fs');const path=require('node:path');
const assets=path.join(path.dirname(require.resolve('metro/package.json')),'src','Assets.js');
let source=fs.readFileSync(assets,'utf8');
const old='var _imageSize = _interopRequireDefault(require("image-size"));';
const previous='var _imageSizeModule = require("image-size"); var _imageSize = {default: _imageSizeModule.imageSize || _imageSizeModule.default || _imageSizeModule};';
const replacement='var _imageSizeModule = require("image-size"); var _imageSize = {default: (input) => (_imageSizeModule.imageSize || _imageSizeModule.default || _imageSizeModule)(typeof input === "string" ? _fs.default.readFileSync(input) : input)};';
if(source.includes(old)){source=source.replace(old,replacement);fs.writeFileSync(assets,source);}
else if(source.includes(previous)){source=source.replace(previous,replacement);fs.writeFileSync(assets,source);}
else if(!source.includes(replacement))throw new Error('Metro image-size adapter needs review after dependency upgrade.');
const metro=require(assets);const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKXcAAAAASUVORK5CYII=','base64');
const result=metro.getAssetSize('png',png,'test.png');if(result.width!==1||result.height!==1)throw new Error('Metro image-size adapter validation failed');
console.log('Metro image-size compatibility validated.');

metro.getAssetData(path.join(__dirname,'../assets/icon.png'),'assets/icon.png',[],null,'/assets').then(result=>{if(result.width!==1024||result.height!==1024)throw new Error('Metro path adapter validation failed');console.log('Metro image path compatibility validated.');}).catch(error=>{console.error(error);process.exitCode=1;});
