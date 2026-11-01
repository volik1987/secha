# Четыре текстуры из листа 2×2 → бесшовные g_*.jpg (смешение с копией, сдвинутой на полразмера)
import numpy as np,sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB');W,H=im.size;N=512
for q,nm in enumerate(['grass','forest','dirt','water']):
    r,c=divmod(q,2);m=40
    t=im.crop((c*W//2+m,r*H//2+m,(c+1)*W//2-m,(r+1)*H//2-m)).resize((N,N),Image.LANCZOS)
    a=np.asarray(t).astype(float);s=np.roll(a,(N//2,N//2),(0,1))
    u=np.abs(np.linspace(-1,1,N));w=np.clip((1-np.maximum(u[:,None],u[None,:]))*2.2,0,1)[...,None]
    Image.fromarray((a*w+s*(1-w)).astype(np.uint8)).save(f'{sys.argv[2]}/g_{nm}.jpg',quality=84)
