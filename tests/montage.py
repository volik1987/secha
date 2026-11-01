# Контактный лист спрайтов на клетчатом фоне: python montage.py out.jpg файлы...
import sys
from PIL import Image,ImageDraw
fs=sys.argv[2:];T=200;C=8;R=(len(fs)+C-1)//C
M=Image.new('RGB',(C*T,R*(T+14)),(90,120,70));d=ImageDraw.Draw(M)
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGBA');im.thumbnail((T-4,T-4))
    x,y=i%C*T,i//C*(T+14);M.paste(im,(x+(T-im.width)//2,y+(T-im.height)//2),im);d.text((x+3,y+T),f.split('/')[-1][:30],fill=(255,255,255))
M.save(sys.argv[1],quality=85)
