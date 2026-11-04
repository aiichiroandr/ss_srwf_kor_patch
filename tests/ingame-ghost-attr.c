#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
uint32_t native_object=0x20216000u;
static uint32_t pool=0x20216000u,pc=0x25c67116u;
static uint16_t code=0xfb9e,mode=0x88,color=0x7624,pmod,colr;
static uint8_t active=128;static unsigned calls;
void ghost_attr(uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t);
uint8_t ghost_test_b(uint32_t a){assert(a==native_object+1);return active;}
uint32_t ghost_test_l(uint32_t a){if(a==0x060b8578u)return pool;assert(a==native_object+0x24);return pc;}
uint16_t *ghost_test_w(uint32_t a){
 if(a==0x25c00102u)return &pmod;if(a==0x25c00104u)return &colr;
 if(a==native_object+0x38)return &code;
 uint32_t row=0x20210800u+10u*(code&1023u);
 if(a==row+2)return &mode;if(a==row+4)return &color;
 fprintf(stderr,"unexpected read %08x\n",a);abort();
}
void ghost_test_attr(uint32_t out,uint32_t ctrl,uint32_t bank,uint32_t priority,uint32_t calc,uint32_t drawmode,uint32_t flags){
 assert(out==0x25c00100u&&ctrl==0xa01&&flags==0);calls++;
 pmod=(uint16_t)drawmode;colr=(priority<<12)|((calc&3)<<10)|((bank&63)<<4);
}
static void draw(int fixed){calls=0;ghost_attr(0x25c00100u,0xa01,34,0,2,0x80,0);assert(calls==1);assert(pmod==(fixed?0x88:0x80));assert(colr==(fixed?color:0xa20));}
int main(void){
 draw(1);code=0xfb9f;color=0x756c;draw(1);
 pool=0;draw(0);pool=0x20216000u;
 native_object=0;draw(0);native_object=0x20218600u;draw(0);native_object=0x20216001u;draw(0);native_object=0x20216000u;
 active=0;draw(0);active=128;
 code=0x039e;draw(0);code=0xfb9d;draw(0);code=0xfba0;draw(0);code=0xfb9e;
 pc=0x25c66fffu;draw(0);pc=0x25c6863au;draw(0);pc=0x25c67116u;
 mode=0x80;draw(0);mode=0x88;color=0x6fffu;draw(0);color=0x8000;draw(0);color=0x7624;draw(1);
 puts("PASS native ATTR once; two aliases; pool, alignment, liveness, script, mode and CLUT boundaries");
}
