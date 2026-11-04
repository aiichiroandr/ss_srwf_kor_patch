#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
static uint32_t pc=0x2021e2f0;
static uint8_t scene,flag,busy;static unsigned feedback;
static uint16_t caption[4],off_words[4]={1,2,3,4},on_words[4]={5,6,7,8};
unsigned short_r_apply(void);
uint8_t *short_r_b(uint32_t a){if(a==0x060c6b07)return &scene;if(a==0x260da2dc)return &flag;assert(a==0x260daff0);return &busy;}
uint16_t *short_r_w(uint32_t a){
 if(a>=0x2021e3e6&&a<0x2021e3ee&&!(a&1))return &caption[(a-0x2021e3e6)/2];
 if(a>=0x260da2e4&&a<0x260da2ec&&!(a&1))return &off_words[(a-0x260da2e4)/2];
 if(a>=0x260da2ec&&a<0x260da2f4&&!(a&1))return &on_words[(a-0x260da2ec)/2];
 assert(0);return 0;
}
uint32_t short_r_l(uint32_t a){assert(a==0x060c6d70);return pc;}
void short_r_feedback(void){feedback++;}
int main(void){
 for(unsigned i=0;i<6;i++){
  pc=i&1?0x2021e34f:0x2021e2f0;assert(short_r_apply()==1);assert(flag==((i+1)&1));assert(feedback==i+1);assert(busy==1);
  for(unsigned j=0;j<4;j++)assert(caption[j]==(flag?off_words[j]:on_words[j]));
 }
 uint16_t saved[4];for(unsigned i=0;i<4;i++)saved[i]=caption[i];
 const uint32_t wrong[]={0,0x2021e33b,0x2021d388,0x2021e34e,0x2021e350};
 for(unsigned i=0;i<5;i++){pc=wrong[i];assert(!short_r_apply());}
 pc=0x2021e2f0;scene=1;assert(!short_r_apply());scene=0;flag=2;assert(!short_r_apply());assert(feedback==6);
 for(unsigned i=0;i<4;i++)assert(caption[i]==saved[i]);
 puts("PASS exact-once short R; native live captions; feedback; scene and state guards");
}
