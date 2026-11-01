# Нарезка листа Magnific на спрайты.
# python slice.py лист.png папка cols rows масштаб имя1 имя2 ... ('-' = пропустить ячейку)
# Фон белый (или чёрный с флагом --black: тогда прозрачность = яркость, для огня/эффектов).
# Части рисунка собираются по компонентам и раскладываются в ячейки по центру — сетка у модели неровная.
import sys,os,numpy as np
from PIL import Image,ImageFilter
from scipy import ndimage as nd
args=[a for a in sys.argv[1:] if not a.startswith('--')];black='--black' in sys.argv
src,out,cols,rows,scale=args[0],args[1],int(args[2]),int(args[3]),float(args[4]);names=args[5:]
im=Image.open(src).convert('RGB');a=np.asarray(im).astype(np.int32);H,W=a.shape[:2]
if black:
    lum=a.max(2);fg=lum>18
else:
    white=a.min(2)>232;lab,_=nd.label(white)
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    fg=~np.isin(lab,list(border))
    # замкнутые пустоты (двор за забором) — тоже фон, если это почти чистый белый
    pure=a.min(2)>244;pl,pn=nd.label(pure)
    if pn:
        sz=nd.sum(pure,pl,range(1,pn+1))
        big=np.isin(pl,1+np.nonzero(sz>int(os.environ.get("HOLE","2500")))[0]);fg&=~big
fg=nd.binary_opening(fg,iterations=1)
grow=nd.binary_dilation(fg,iterations=6)
lab,n=nd.label(grow)
cells={}
for i,sl in enumerate(nd.find_objects(lab),1):
    m=(lab[sl]==i)&fg[sl];cnt=m.sum()
    if cnt<400:continue
    ys,xs=np.nonzero(m);cy=ys.mean()+sl[0].start;cx=xs.mean()+sl[1].start
    k=min(int(cy*rows/H),rows-1)*cols+min(int(cx*cols/W),cols-1)
    cells.setdefault(k,[]).append((i,sl))
# одинаковое имя в нескольких ячейках = склеить их (крупный рисунок на две клетки)
for nm in dict.fromkeys(names):
    ks=[k for k,x in enumerate(names) if x==nm and k in cells]
    if nm=='-':continue
    if not ks:print('EMPTY',nm);continue
    mask=np.zeros((H,W),bool)
    for k in ks:
        for i,sl in cells[k]:mask[sl]|=(lab[sl]==i)
    mask&=nd.binary_dilation(fg,iterations=1)
    ys,xs=np.nonzero(mask);y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    sub=a[y0:y1,x0:x1].astype(np.uint8)
    if black:
        al=np.clip(sub.max(2)*1.6,0,255)*mask[y0:y1,x0:x1]
        rgb=np.clip(sub.astype(float)*255/np.maximum(sub.max(2,keepdims=True),1),0,255).astype(np.uint8)
        o=Image.fromarray(rgb).convert('RGBA');o.putalpha(Image.fromarray(al.astype(np.uint8)))
    else:
        al=Image.fromarray((mask[y0:y1,x0:x1]*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8))
        o=Image.fromarray(sub).convert('RGBA');o.putalpha(al)
    o=o.resize((max(1,round(o.width*scale)),max(1,round(o.height*scale))),Image.LANCZOS)
    o.save(os.path.join(out,nm+'.png'),optimize=True);print(nm,o.size)
