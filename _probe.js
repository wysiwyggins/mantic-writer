window.addEventListener('load',()=>{
  const steps=[
    ()=>{handleMIDIMessage({data:[0x90,53,100]});handleMIDIMessage({data:[0x80,53,0]});},
    ()=>{handleMIDIMessage({data:[0x90,48,100]});handleMIDIMessage({data:[0x80,48,0]});},
    ()=>{handleMIDIMessage({data:[0x90,55,100]});handleMIDIMessage({data:[0x90,57,100]});handleMIDIMessage({data:[0x80,55,0]});handleMIDIMessage({data:[0x80,57,0]});},
    ()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',keyCode:32,bubbles:true}));},
    ()=>{handleMIDIMessage({data:[0x90,60,100]});handleMIDIMessage({data:[0x80,60,0]});},
  ];
  steps.forEach((f,i)=>setTimeout(()=>{f();setTimeout(()=>console.log('PROBE name after step',i,'=',JSON.stringify(figureName),'seed',currentSeed),1200)},1500+i*1500));
});
