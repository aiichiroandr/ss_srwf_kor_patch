export function departureFixture(physicalIndex=60){
 const four=physicalIndex===36,roots=four?[9182,104,1975,104,3241,3695,548,104,4254,5062,5323,5325,5682,9176]:[8446,104,1975,104,2305,2855,548,104,3113,4261,4263,4265,4358,8440];
 const decoded=new Uint8Array(four?33617:13378),v=new DataView(decoded.buffer);roots.forEach((n,i)=>v.setInt32(i*4,n-i*4));
 const put=(at,hex)=>decoded.set(Uint8Array.from(hex.match(/../g),s=>parseInt(s,16)),at);
 if(four)put(5003,'c102001cc20001acc20001ad01fd36');
 else{
  put(3768,'c1020016c002001ac003f100000e820001820002820201050001050014c102001ad000014fd00000ec01fd9f');
  put(3868,'c1020016d000014fd00000ec01fd58');
  put(3201,'d00200e8f000000ac00e0023f10002a3d00200e9f000000ac00e0027f10002f9d00200fbf000000ad00200e4f000034fd3fdf3000b0000d3fcf2000f0000d3fbf2000b0000e901ff61');
 }
 return {physicalIndex,slots:[four?133:157],roots,decoded};
}
