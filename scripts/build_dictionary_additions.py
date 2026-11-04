#!/usr/bin/env python3
"""Assemble authored Saturn dictionary helpers; no ROM input or game assets.

The loader recipes bind these bytes to exact DIC/EXEC preimages. This script
only emits the 1 KiB shared helper block and its authored component routines.
See docs/SRW4_DICTIONARY_ADDITIONS.md for callers, RAM and entry conditions.
"""
from pathlib import Path
import argparse
import struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, required=True)
D = parser.parse_args().out
D.mkdir(parents=True, exist_ok=True)

class Code:
 def __init__(self,base):self.base=base;self.words=[];self.labels={};self.refs=[];self.pool=[]
 def emit(self,*words):self.words.extend(words)
 def mark(self,n):self.labels[n]=self.base+2*len(self.words)
 def literal(self,r,value):self.pool.append((len(self.words),r,value));self.emit(0)
 def branch(self,op,n):self.refs.append((len(self.words),op,n));self.emit(0)
 def finish(self):
  while len(self.words)%2:self.emit(0x0009)
  tail=bytearray()
  for i,r,value in self.pool:
   target=self.base+2*len(self.words)+len(tail);pc=self.base+2*i
   d=(target-((pc+4)&~3))//4;assert 0<=d<=255
   self.words[i]=0xd000|(r<<8)|d;tail.extend(struct.pack('>I',value))
  for i,op,n in self.refs:
   d=(self.labels[n]-(self.base+2*i+4))//2
   if op==0xa000:assert -2048<=d<2048;self.words[i]=op|(d&0xfff)
   else:assert -128<=d<128;self.words[i]=op|(d&255)
  return b''.join(struct.pack('>H',w)for w in self.words)+tail

# The small assembler is reused; every immediate and relative branch is bounded.
def mov(c,n,m):c.emit(0x6003|(n<<8)|(m<<4))
def imm(c,n,v):c.emit(0xe000|(n<<8)|(v&255))
def ld(c,n,m,size=4):c.emit(0x6000|(n<<8)|(m<<4)|{1:0,2:1,4:2}[size])
def st(c,n,m,size=4):c.emit(0x2000|(n<<8)|(m<<4)|{1:0,2:1,4:2}[size])
def add(c,n,m):c.emit(0x300c|(n<<8)|(m<<4))
def plus(c,n,v):c.emit(0x7000|(n<<8)|(v&255))
def tst(c,n):c.emit(0x2008|(n<<8)|(n<<4))
def eq(c,n,m):c.emit(0x3000|(n<<8)|(m<<4))
def push(c,n):c.emit(0x2f06|(n<<4))
def pop(c,n):c.emit(0x60f6|(n<<8))
def call(c,fn):c.literal(0,fn);c.emit(0x400b,9)
def ret(c):c.emit(0x000b,9)
def tail(c,fn):c.literal(0,fn);c.emit(0x402b,9)
def save(c,n,base,limit):
 b=c.finish();assert len(b)<=limit,(n,len(b));(D/(n+'.bin')).write_bytes(b);return (base,b)
parts=[]
# Person work: ALICE has its own title; retain the proven protagonist adapter.
c=Code(0x2029f600);c.emit(0x002a);c.literal(1,0x0608666c);eq(c,0,1);c.branch(0x8b00,'old');c.literal(0,0x060c63ea);ld(c,0,0,2);c.emit(0x4000);c.literal(1,0x060c63f0);c.emit(0x001d);c.literal(1,399);eq(c,0,1);c.branch(0x8b00,'old');c.literal(0,0x2029fa0c);ld(c,0,0);ret(c);c.mark('old');tail(c,0x2029f200)
parts.append(save(c,'person-work',0x2029f600,64))
# Unit header/work lookup. The 20-byte display header is disposable; game stats
# and original unit records are never rewritten by dictionary viewing.
c=Code(0x2029f640);c.emit(0x002a);c.literal(1,0x06086926);eq(c,0,1);c.branch(0x8900,'handle');c.literal(1,0x0608698c);eq(c,0,1);c.branch(0x8b00,'old');c.mark('handle');push(c,4);push(c,5);c.emit(0x4f22);c.literal(0,0x060c63ea);ld(c,0,0,2);c.emit(0x600d,0x4000);c.literal(1,0x060c63f0);c.emit(0x001d,0x640d);call(c,0x2029f700);mov(c,7,0);c.emit(0x4f26);pop(c,5);pop(c,4);c.emit(0x002a);c.literal(1,0x06086926);eq(c,0,1);c.branch(0x8900,'record');tst(c,7);c.branch(0x8900,'old');c.emit(0x5071);ret(c)
c.mark('old');tail(c,0x06004cc8)
# Unit records are packed at 2-byte granularity (every other record starts at
# 2 mod 4), so the copy is bytewise: a longword load from such a record raises
# an SH-2 address error and the dictionary hangs on a black screen.
c.mark('record');tst(c,7);c.branch(0x8900,'actual');c.literal(7,0x2029fef0);imm(c,2,20)
c.mark('copy');c.emit(0x6064);st(c,7,0,1);plus(c,7,1);c.emit(0x4210);c.branch(0x8b00,'copy')
c.literal(0,0x2029fef0);mov(c,1,0);plus(c,1,11);imm(c,2,8);imm(c,3,0)
c.mark('zero');st(c,1,3,1);plus(c,1,1);c.emit(0x4210);c.branch(0x8b00,'zero');ret(c)
c.mark('actual');mov(c,0,6);ret(c)
parts.append(save(c,'unit-header',0x2029f640,192))
# Match the current, authenticated unit table by its battle graphic, never KOM id.
# The graphic word is read as two bytes for the same alignment reason.
c=Code(0x2029f700);c.literal(1,0x2021d06c);ld(c,2,1);add(c,1,2);ld(c,2,1);c.emit(0x4209);eq(c,4,2);c.emit(0x3422);c.branch(0x8900,'none');mov(c,0,4);c.emit(0x4008);add(c,0,1);ld(c,6,0);add(c,6,0);mov(c,0,6);plus(c,0,2);c.emit(0x6104,0x4118,0x6200,0x622c,0x212b);c.literal(2,511);c.emit(0x2129);c.literal(0,0x2029fa14);ld(c,3,0);c.literal(0,0x2029fa20)
c.mark('loop');tst(c,3);c.branch(0x8900,'none');ld(c,2,0);eq(c,1,2);c.branch(0x8900,'yes');plus(c,0,16);plus(c,3,-1);c.branch(0xa000,'loop');c.emit(9)
c.mark('none');imm(c,0,0);c.mark('yes');ret(c)
parts.append(save(c,'find-unit',0x2029f700,128))
# Both native and grouped DIC readers obtain the selected body through this
# hook. The original pager still copies/advances text and handles F6/FF.
c=Code(0x2029f780);c.literal(0,0x2029fa00);ld(c,0,0);imm(c,1,1);eq(c,0,1);c.branch(0x8b00,'unit');c.literal(0,399);eq(c,5,0);c.branch(0x8b00,'old');c.literal(0,0x2029fa10);ld(c,0,0);ret(c)
c.mark('unit');push(c,4);push(c,5);c.emit(0x4f22);mov(c,4,5);call(c,0x2029f700);c.emit(0x4f26);pop(c,5);pop(c,4);tst(c,0);c.branch(0x8900,'old');c.emit(0x5002);ret(c)
c.mark('old');c.literal(0,0x2029fa08);ld(c,0,0);c.emit(0x402b,9)
parts.append(save(c,'body-lookup',0x2029f780,128))
# Shared percentage update: R4 is the denominator including added entries.
c=Code(0x2029f940);mov(c,5,4);c.literal(0,0x060c63ec);ld(c,4,0,2);c.emit(0x644d);imm(c,1,100);c.emit(0x0417,0x041a,0x4f22);call(c,0x060a4dfc);c.emit(0x4f26);c.literal(1,0x060c6150);st(c,1,0);ret(c)
parts.append(save(c,'percentage',0x2029f940,96))
# Robot list wrapper scans only the existing table, appends matching additions,
# and bounds the same 511-entry list buffer. Registration flags are untouched.
c=Code(0x2029f800)
for n in [8,9,10,11,12]:push(c,n)
c.emit(0x4f22);call(c,0x06085c28);mov(c,10,0);c.literal(0,0x060c63ec);ld(c,11,0,2);c.emit(0x6bbd);c.literal(0,0x2021d06c);ld(c,1,0);add(c,0,1);ld(c,9,0);c.emit(0x4909);imm(c,8,0)
c.mark('scan');mov(c,4,8);call(c,0x2029f700);tst(c,0);c.branch(0x8900,'next');c.literal(1,0x060c63ec);ld(c,0,1,2);c.emit(0x600d);c.literal(2,510);c.emit(0x3022);c.branch(0x8900,'next');mov(c,3,0);c.emit(0x4300);c.literal(2,0x060c63f0);add(c,2,3);st(c,2,8,2);plus(c,0,1);st(c,1,0,2)
c.mark('next');plus(c,8,1);c.emit(0x3892);c.branch(0x8b00,'scan');c.literal(0,0x060c63ec);ld(c,4,0,2);c.emit(0x644d,0x34b8);c.literal(1,304);add(c,4,1);call(c,0x2029f940);mov(c,0,10);c.emit(0x4f26)
for n in [12,11,10,9,8]:pop(c,n)
ret(c);parts.append(save(c,'unit-list',0x2029f800,192))
# ALICE is appended only by an EXEC hook installed for its authenticated identity.
c=Code(0x2029f8c0);push(c,8);c.emit(0x4f22);call(c,0x06085b54);mov(c,8,0);c.literal(1,0x060c63ec);ld(c,0,1,2);c.emit(0x600d);c.literal(2,510);c.emit(0x3022);c.branch(0x8900,'finish');mov(c,3,0);c.emit(0x4300);c.literal(2,0x060c63f0);add(c,2,3);c.literal(3,399);st(c,2,3,2);plus(c,0,1);st(c,1,0,2);c.literal(4,256);call(c,0x2029f940)
c.mark('finish');mov(c,0,8);c.emit(0x4f26);pop(c,8);ret(c);parts.append(save(c,'person-list',0x2029f8c0,128))
# Code is identical in both active DIC buffers. Data and mutable scratch stay
# outside the native code module's CRC range.
blob=bytearray(0x400)
for base,b in parts:
 at=base-0x2029f600;assert 0<=at and at+len(b)<=len(blob);assert not any(blob[at:at+len(b)]);blob[at:at+len(b)]=b
(D/'common-code.bin').write_bytes(blob)
print('dictionary shared code:', len(blob), 'bytes')
