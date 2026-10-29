"""DIO tensor-only deployment boundary, retained from the verified v1 exporter.

Original DIO wrapper and compact relative-position algebra; model layers retain
their upstream MIT attribution. No upstream restricted helper is imported.
"""
import torch
from torch import nn
from .modules.self_attention import RelativePositionalEmbedding2d


def deployment_modules(generator):
    for parent in generator.component_encoder.modules():
        for name, child in list(parent.named_children()):
            if isinstance(child, RelativePositionalEmbedding2d):
                setattr(parent, name, MobileRelativePosition(child))
    return Encoder(generator.component_encoder).eval(), Decoder(generator).eval()

class MobileRelativePosition(nn.Module):
    """Same relative-position sum, avoiding a 1024x1024x32 constant.

    q*(Ry+Rx) is evaluated as q*Ry + q*Rx, using HxH/WxW
    relative-coordinate indices. This changes floating-point association only;
    its effect is explicitly measured against the original implementation.
    """
    def __init__(self,old):
        super().__init__()
        assert not old.down_kv
        self.H=old.H;self.W=old.W;self.h_emb=old.h_emb;self.w_emb=old.w_emb
        y=torch.arange(self.H);x=torch.arange(self.W)
        self.register_buffer('y_index',y[None,:]-y[:,None]+self.H-1)
        self.register_buffer('x_index',x[None,:]-x[:,None]+self.W-1)
    def forward(self,query):
        batch,heads,channels,_=query.shape
        q=query.transpose(2,3).reshape(batch,heads,self.H,self.W,channels)
        hs=torch.matmul(q,self.h_emb.weight.t())
        ws=torch.matmul(q,self.w_emb.weight.t())
        hi=self.y_index.reshape(1,1,self.H,1,self.H).expand(batch,heads,self.H,self.W,self.H)
        wi=self.x_index.reshape(1,1,1,self.W,self.W).expand(batch,heads,self.H,self.W,self.W)
        h=torch.gather(hs,-1,hi).unsqueeze(-1)
        w=torch.gather(ws,-1,wi).unsqueeze(-2)
        return (h+w).reshape(batch,heads,self.H*self.W,self.H*self.W)

class Encoder(nn.Module):
    def __init__(self,encoder):super().__init__();self.encoder=encoder
    def forward(self,image):
        features=self.encoder(image)
        return features[-1],features[3]

class Decoder(nn.Module):
    def __init__(self,gen):super().__init__();self.persistent=gen.memory.persistent_memory;self.decoder=gen.decoder
    def forward(self,components,skips,component_addresses):
        features=self.persistent(components,component_addresses)
        return self.decoder(features,[skips])

def aggregate_reference_features(characters,features,skips,decompose):
    """Equivalent to upstream DynamicMemory.read(mean), with fixed 68 slots.

    Store user-specific arrays separately. Missing components are never filled
    by another writer, a source font, or uninitialized memory.
    """
    import numpy as np
    main=np.zeros((68,*features.shape[2:]),dtype=np.float32)
    skip=np.zeros((68,*skips.shape[2:]),dtype=np.float32)
    count=np.zeros(68,dtype=np.int64)
    addresses=[]
    for c in characters:
        l,v,t=decompose(c);addresses.append([l,19+v,40+t])
    for a in range(68):
        where=[(i,k) for i,parts in enumerate(addresses) for k,p in enumerate(parts) if p==a]
        if where:
            # Float32 mean over the same ordered feature list as the PC path.
            main[a]=np.stack([features[i,k] for i,k in where]).mean(axis=0,dtype=np.float32)
            skip[a]=np.stack([skips[i,k] for i,k in where]).mean(axis=0,dtype=np.float32)
            count[a]=len(where)
    return main,skip,count

def target_features(char,main,skip,count,decompose):
    import numpy as np
    l,v,t=decompose(char);addresses=np.asarray([[l,19+v,40+t]],dtype=np.int64)
    if np.any(count[addresses]==0):raise ValueError(f'Missing own handwriting component for {char}')
    return main[addresses],skip[addresses],addresses
