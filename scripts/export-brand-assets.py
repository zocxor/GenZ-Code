"""Mechanical size/format exports from generated masters; no artistic edits."""
from pathlib import Path
from PIL import Image
import json
p=Path(__file__).resolve().parents[1];a=p/'assets/brand';res=p/'android/app/src/main/res'
mark=Image.open(a/'genz-code-mark.png').convert('RGBA')
def square(size,scale=1,bg=None):
 out=Image.new('RGBA',(size,size),bg or (0,0,0,0));im=mark.copy();im.thumbnail((round(size*scale),round(size*scale)),Image.Resampling.LANCZOS);out.alpha_composite(im,((size-im.width)//2,(size-im.height)//2));return out
square(1024,.9,'#fff4ff').convert('RGB').save(p/'assets/icon.png')
square(1024,.76).save(p/'assets/adaptive-icon.png')
for size in [32,48,64,128,192,256,512]:square(size).save(a/f'icon-{size}.png')
square(48).save(p/'assets/favicon.png')
for density,scale in [('mdpi',1),('hdpi',1.5),('xhdpi',2),('xxhdpi',3),('xxxhdpi',4)]:
 folder=res/f'mipmap-{density}';folder.mkdir(exist_ok=True)
 for name in ['ic_launcher.webp','ic_launcher_round.webp']:square(round(48*scale),.9,'#fff4ff').convert('RGB').save(folder/name,lossless=True)
 square(round(108*scale),.76).save(folder/'ic_launcher_foreground.png')
 folder=res/f'drawable-{density}';folder.mkdir(exist_ok=True);square(round(160*scale)).save(folder/'splashscreen_logo.png')
folder=res/'mipmap-anydpi-v26';folder.mkdir(exist_ok=True)
for name in ['ic_launcher.xml','ic_launcher_round.xml']:(folder/name).write_text('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n')
(res/'drawable/ic_launcher_background.xml').write_text('<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#FFF4FF"/></shape>\n')
(res/'drawable/splash_genz.xml').write_text('<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@drawable/ic_launcher_background"/><item><bitmap android:src="@drawable/splashscreen_logo" android:gravity="center"/></item></layer-list>\n')
f=p/'app.json';j=json.loads(f.read_text());j['expo']['version']='0.7.0';j['expo']['android']['versionCode']=7;j['expo']['android']['adaptiveIcon']={'foregroundImage':'./assets/adaptive-icon.png','backgroundColor':'#FFF4FF'};j['expo']['web']['favicon']='./assets/favicon.png';f.write_text(json.dumps(j,indent=2)+'\n')
for name in ['package.json','package-lock.json']:
 f=p/name;j=json.loads(f.read_text());j['version']='0.7.0'
 if name=='package-lock.json':j['packages']['']['version']='0.7.0'
 f.write_text(json.dumps(j,indent=2)+'\n')
f=p/'android/app/build.gradle';f.write_text(f.read_text().replace('versionCode 5','versionCode 7').replace('versionName "0.5.0"','versionName "0.7.0"'))
print('Brand exports generated')
