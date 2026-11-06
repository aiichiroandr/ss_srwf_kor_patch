#!/usr/bin/env python3
"""Assemble the person-section dictionary header helpers (DIC S1 only); no ROM input or game assets.

0x2029F240 points one root-12 (full name, F230..F23F) or root-13 (alias, F430..F43F) cell at the approved Korean
string while the detail header (0x06086608..0x06086810) queues and interprets it; 0x2029F500 restores the pending
cells before the portrait draw 0x06014860. Save words: 0x2029F580/F584 (full), 0x2029F588/F58C (alias).

Root-12 and root-13 cells start at 2 mod 4 (bases 0x002460E2 and 0x00247402 in the JP, v0.3 and v0.4 TSR; the game
reads them bytewise in 0x06004CC8). The 2026-11-01 helpers used mov.l on the cell, which raises an SH-2 address
error on hardware and Mednafen (the native port does not trap, so its 11-01 captures passed). The default output
keeps every entry, table, save word and behaviour and only replaces the cell accesses with aligned mov.w pairs;
an odd cell (never seen) is left untouched. --legacy re-emits the 11-01/srw4 bytes so a build can prove its preimage.
"""
from pathlib import Path
import argparse
import struct

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--legacy', action='store_true', help='emit the 2026-11-01 bytes (preimage proof only)')
args = parser.parse_args()
D = args.out
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

def save(name,c,limit):
 b=c.finish();assert len(b)<=limit,(name,len(b));(D/(name+'.bin')).write_bytes(b);return b

# Name swap, entry 0x2029F240 (EXEC literals 0x06086790 and 0x06086824). Free bytes up to the table at 0x2029F400.
c=Code(0x2029f240);c.emit(0x6043);c.literal(1,0xf230);c.emit(0x3018,0xe110,0x3012);c.branch(0x8b00,'full')
c.emit(0x6043);c.literal(1,0xf430);c.emit(0x3018,0xe110,0x3012);c.branch(0x8b00,'alias');c.branch(0xa000,'native');c.emit(0x0009)
c.mark('full');c.literal(1,0x2021d030);c.literal(2,0x2029f580);c.literal(3,0x2029f400);c.branch(0xa000,'redirect');c.emit(0x0009)
c.mark('alias');c.literal(1,0x2021d034);c.literal(2,0x2029f588);c.literal(3,0x2029f420)
c.mark('redirect');c.emit(0x6603,0x4001,0x4008,0x073e,0x6063)
c.emit(0x6312,0x331c);c.literal(6,304);c.emit(0x306c,0x4008,0x330c)
if args.legacy:
 c.emit(0x2232,0x6032,0x1201,0x3738,0x2372)
else:
 # R3 = cell (2 mod 4). Odd cell: no swap. Save the address, then the old value as two words at +4/+6 (the
 # portrait helper reads them back as words); write K-cell as two words.
 c.emit(0x6033,0xc801);c.branch(0x8b00,'native')
 c.emit(0x2232,0x6031,0x8122,0x8531,0x8123)
 c.emit(0x3738,0x6073,0x8131,0x4029,0x2301)
c.mark('native');c.literal(0,0x06015ff4);c.emit(0x402b,0x0009)
name=save('name-helper',c,0x2029f400-0x2029f240)

# Restore before the portrait draw, entry 0x2029F500 (EXEC literal 0x0608682C). Must end below the save words.
# The caller passes a stack argument (pushed in the jsr delay slot): R15 and R3..R7 are not touched except the
# original R7 portrait variant for 304..319.
c=Code(0x2029f500)
for i,scratch in enumerate([0x2029f580,0x2029f588]):
 if args.legacy:
  c.literal(0,scratch);c.emit(0x6102,0x2118);c.branch(0x8900,'clear'+str(i));c.emit(0x5201,0x2122,0xe100,0x2012)
 else:
  c.literal(2,scratch);c.emit(0x6122,0x2118);c.branch(0x8900,'clear'+str(i));c.emit(0x8522,0x2101,0x8523,0x8111,0xe000,0x2202)
 c.mark('clear'+str(i))
c.literal(0,0x060c63ea);c.emit(0x6001,0x600d,0x4000);c.literal(1,0x060c63f0);c.emit(0x001d,0x600d,0x6103,0x4109,0x4109,0xe213,0x3120);c.branch(0x8b00,'draw');c.emit(0xe101,0x201b,0x6703);c.mark('draw');c.literal(0,0x06014860);c.emit(0x402b,0x0009)
face=save('face-helper',c,0x2029f580-0x2029f500)
print('dictionary header helpers:', 'legacy' if args.legacy else 'aligned', 'name', len(name), 'face', len(face))
