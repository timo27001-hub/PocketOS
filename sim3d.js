
// PocketOS Mini Corsa: self-contained offline WebGL racer.
function launchCorsa3D(){
  stopGame();
  const shell=document.getElementById('desktop-shell');
  const overlay=document.createElement('div');
  overlay.id='corsaOverlay';
  overlay.innerHTML='<canvas id="corsaView"></canvas><div id="corsaHud"><strong id="corsaSpeed">0</strong> km/h · <strong id="corsaGear">1</strong><br><span id="corsaLap">Kolo 1 · 0:00.0</span><br><span id="corsaBest">Najlepšie: —</span></div><button id="corsaReset">↺ Reset</button><button id="corsaCamera" aria-label="Zmeniť kameru">📷 Kamera</button><button id="corsaExit" aria-label="Zavrieť hru">✕ Zavrieť</button><div id="corsaHelp">WASD / šípky · bez autopilota · R = reset</div><div id="corsaControls"><div class="group"><button id="corsaLeft">◀</button><button id="corsaRight">▶</button></div><div class="group"><button id="corsaBrake">BRZDA</button><button id="corsaGas">PLYN</button></div></div>';
  shell.appendChild(overlay);
  const canvas=overlay.querySelector('canvas');
  const gl=canvas.getContext('webgl',{antialias:true,alpha:false,depth:true,powerPreference:'high-performance'});
  const keys={left:false,right:false,gas:false,brake:false};
  const cleanup=[];
  let live=true,raf=0,cameraMode=0;
  function close(){
    if(!live)return;live=false;
    cancelAnimationFrame(raf);cleanup.forEach(fn=>fn());
    overlay.remove();
    if(gameCleanup===close)gameCleanup=null;
  }
  gameCleanup=close;
  overlay.querySelector('#corsaCamera').addEventListener('click',()=>{cameraMode=(cameraMode+1)%3});
  overlay.querySelector('#corsaExit').addEventListener('click',()=>{close();showGames()});
  const keymap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'gas',ArrowDown:'brake',a:'left',d:'right',w:'gas',s:'brake',A:'left',D:'right',W:'gas',S:'brake'};
  function kd(e){if(e.key==='r'||e.key==='R'){resetCar();return}const k=keymap[e.key];if(k){e.preventDefault();keys[k]=true}}
  function ku(e){const k=keymap[e.key];if(k){e.preventDefault();keys[k]=false}}
  function blur(){Object.keys(keys).forEach(k=>keys[k]=false)}
  window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',blur);
  cleanup.push(()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',blur)});
  for(const [id,key] of [['corsaLeft','left'],['corsaRight','right'],['corsaGas','gas'],['corsaBrake','brake']]){
    const btn=overlay.querySelector('#'+id);
    function down(e){e.preventDefault();keys[key]=true;btn.classList.add('pressed');try{btn.setPointerCapture(e.pointerId)}catch(_){}}
    function up(e){e.preventDefault();keys[key]=false;btn.classList.remove('pressed')}
    btn.addEventListener('pointerdown',down);
    btn.addEventListener('pointerup',up);
    btn.addEventListener('pointercancel',up);
    btn.addEventListener('lostpointercapture',up);
    btn.addEventListener('contextmenu',e=>e.preventDefault());
  }
  overlay.addEventListener('contextmenu',e=>e.preventDefault());
  if(!gl){
    overlay.insertAdjacentHTML('beforeend','<div id="corsaError">WebGL nie je dostupné v tomto prehliadači. Skús Safari alebo skontroluj nastavenia zariadenia.</div>');
    return;
  }
  const vert='attribute vec3 p;attribute vec3 c;uniform mat4 vp;varying vec3 v;void main(){gl_Position=vp*vec4(p,1.);v=c;}';
  const frag='precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.);}';
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
  let program;
  try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));}
  catch(err){overlay.insertAdjacentHTML('beforeend','<div id="corsaError">Chyba WebGL: '+String(err.message).replace(/[<>]/g,'')+'</div>');return}
  gl.useProgram(program);
  const ap=gl.getAttribLocation(program,'p'),ac=gl.getAttribLocation(program,'c'),uvp=gl.getUniformLocation(program,'vp');
  const pb=gl.createBuffer(),cb=gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  let positions=[],colors=[];
  const col={
    grass:[.16,.43,.27],grass2:[.18,.49,.31],road:[.27,.30,.35],
    line:[.95,.93,.81],red:[.80,.16,.17],white:[.93,.92,.86],
    car:[.07,.60,.96],glass:[.18,.29,.40],tire:[.055,.07,.08],
    lamp:[.95,.12,.12],yellow:[.99,.72,.15],trunk:[.35,.21,.12],
    tree:[.09,.31,.16],tree2:[.13,.39,.19],barrier:[.60,.66,.71],
    building:[.35,.41,.51],roof:[.21,.27,.35],hill:[.27,.40,.44]
  };
  function tri(a,b,c,color){for(const q of [a,b,c]){positions.push(q[0],q[1],q[2]);colors.push(...color)}}
  function quad(a,b,c,d,color){tri(a,b,c,color);tri(a,c,d,color)}
  function box(x,y,z,w,h,l,color){
    const X=x-w/2,Y=y,Z=z-l/2,A=[X,Y,Z],B=[X+w,Y,Z],C=[X+w,Y+h,Z],D=[X,Y+h,Z],E=[X,Y,Z+l],F=[X+w,Y,Z+l],G=[X+w,Y+h,Z+l],H=[X,Y+h,Z+l];
    quad(A,B,C,D,color);quad(F,E,H,G,color);quad(E,A,D,H,color);quad(B,F,G,C,color);quad(D,C,G,H,color);quad(E,F,B,A,color)
  }
  // Continuous oval circuit. Tangent and normal computed analytically.
  const N=160,rx=96,rz=62,roadWidth=11;
  function track(t){
    const a=t*Math.PI*2;
    const x=rx*Math.cos(a),z=rz*Math.sin(a);
    const dx=-rx*Math.sin(a),dz=rz*Math.cos(a),len=Math.hypot(dx,dz);
    return {x,z,tx:dx/len,tz:dz/len,nx:dz/len,nz:-dx/len};
  }
  function at(t,lateral=0){const p=track(t);return [p.x+p.nx*lateral,0,p.z+p.nz*lateral]}
  function ribbon(t1,t2,from,to,color,y=.012){
    const a=at(t1,from),b=at(t1,to),c=at(t2,to),d=at(t2,from);
    for(const p of [a,b,c,d])p[1]=y;
    quad(a,b,c,d,color)
  }
  function carMesh(x,z,yaw,color,scale=1){
    // Local car coordinate: forward along +Z, body box and wheels transformed.
    function T(lx,ly,lz){return [x+scale*(lx*Math.cos(yaw)+lz*Math.sin(yaw)),ly*scale,z+scale*(-lx*Math.sin(yaw)+lz*Math.cos(yaw))]}
    function cube(lx,ly,lz,w,h,l,c){
      const X=lx-w/2,Z=lz-l/2,Y=ly;
      const A=T(X,Y,Z),B=T(X+w,Y,Z),C=T(X+w,Y+h,Z),D=T(X,Y+h,Z),E=T(X,Y,Z+l),F=T(X+w,Y,Z+l),G=T(X+w,Y+h,Z+l),H=T(X,Y+h,Z+l);
      quad(A,B,C,D,c);quad(F,E,H,G,c);quad(E,A,D,H,c);quad(B,F,G,C,c);quad(D,C,G,H,c);quad(E,F,B,A,c)
    }
    cube(0,.46,0,2.15,.65,4.3,color);
    cube(0,1.09,-.25,1.7,.62,2.25,col.glass);
    cube(0,.72,-2.05,1.8,.18,.12,col.lamp);
    for(const lx of [-1.06,1.06])for(const lz of [-1.32,1.35])cube(lx,.15,lz,.35,.60,.8,col.tire);
    cube(0,1.42,-1.52,2.4,.13,.30,color);
  }
  function tree(x,z,k=1){
    box(x,0,z,.5*k,2.5*k,.5*k,col.trunk);
    box(x,2.2*k,z,2.8*k,3.5*k,2.8*k,col.tree);
    box(x,4.7*k,z,1.9*k,1.5*k,1.9*k,col.tree2);
  }
  function staticScene(){
    // Large grassy ground, with distant rolling terrain and a few structures.
    quad([-220,-.08,-180],[220,-.08,-180],[220,-.08,180],[-220,-.08,180],col.grass);
    for(let i=0;i<N;i++){
      const a=i/N,b=(i+1)/N;
      ribbon(a,b,-roadWidth/2-1.1,roadWidth/2+1.1,i%2?col.white:col.red,.018);
      ribbon(a,b,-roadWidth/2,roadWidth/2,col.road,.03);
      ribbon(a,b,-roadWidth/2+.26,-roadWidth/2+.40,col.line,.04);
      ribbon(a,b,roadWidth/2-.40,roadWidth/2-.26,col.line,.04);
      if(i%4<2)ribbon(a,b,-.14,.14,col.line,.05);
      if(i===0)for(let j=0;j<8;j++)ribbon(a,b,-5.4+j*1.35,-4.72+j*1.35,j%2?col.road:col.white,.06);
    }
    for(let i=0;i<65;i++){
      const t=i/65,p=track(t),side=i%2?1:-1,far=19+(i*17)%16;
      const x=p.x+p.nx*side*far,z=p.z+p.nz*side*far;
      tree(x,z,.8+(i%4)*.18);
    }
    box(0,0,0,13,7,11,col.building);box(0,7,0,15,1.2,13,col.roof);
    for(let i=0;i<8;i++){let a=i*Math.PI/4;box(Math.cos(a)*190,0,Math.sin(a)*145,30,14,20,col.hill)}
  }
  function perspective(fov,aspect,near,far){
    const f=1/Math.tan(fov/2),out=new Float32Array(16);
    out[0]=f/aspect;out[5]=f;out[10]=(far+near)/(near-far);out[11]=-1;out[14]=2*far*near/(near-far);return out;
  }
  function lookAt(eye,target){
    let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2],n=Math.hypot(zx,zy,zz);zx/=n;zy/=n;zz/=n;
    let xx=zz,xz=-zx,nx=Math.hypot(xx,xz);xx/=nx;xz/=nx;
    const yx=zy*xz,yy=zz*xx-zx*xz,yz=-zy*xx;
    return new Float32Array([xx,yx,zx,0,0,yy,zy,0,xz,yz,zz,0,-xx*eye[0]-xz*eye[2],-yx*eye[0]-yy*eye[1]-yz*eye[2],-zx*eye[0]-zy*eye[1]-zz*eye[2],1]);
  }
  function mul(a,b){const o=new Float32Array(16);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)o[i+j*4]+=a[i+k*4]*b[k+j*4];return o}
  let t=.12,speed=0,lap=1,lapTime=0,best=Infinity,completed=false,prev=performance.now(),steer=0;
  let spawn=track(t),carX=spawn.x,carZ=spawn.z,heading=Math.atan2(spawn.tx,spawn.tz),lastTrackT=t;
  // World-space vehicle movement: no automatic attachment to the circuit.
  function nearestTrack(x,z){
    let a=Math.atan2(z/rz,x/rx);
    let u=(a/(Math.PI*2)+1)%1;
    // Refine nearest point on elliptical track, not just angular projection.
    for(let i=0;i<5;i++){
      const q=track(u),dx=-rx*Math.sin(u*2*Math.PI),dz=rz*Math.cos(u*2*Math.PI);
      const ddx=-rx*Math.cos(u*2*Math.PI),ddz=-rz*Math.sin(u*2*Math.PI);
      const ex=q.x-x,ez=q.z-z;
      const step=(ex*dx+ez*dz)/(dx*dx+dz*dz+ex*ddx+ez*ddz);
      u=(u-step/(2*Math.PI)+1)%1;
    }
    const q=track(u);
    return {u,q,distance:Math.hypot(x-q.x,z-q.z)};
  }
  function resetCar(){
    const q=track(.12);carX=q.x;carZ=q.z;heading=Math.atan2(q.tx,q.tz);
    t=.12;lastTrackT=t;speed=0;steer=0;lap=1;lapTime=0;completed=false;
    Object.keys(keys).forEach(k=>keys[k]=false);
  }
  overlay.querySelector('#corsaReset').onclick=resetCar;
  const speedEl=overlay.querySelector('#corsaSpeed'),lapEl=overlay.querySelector('#corsaLap'),bestEl=overlay.querySelector('#corsaBest');
  function render(now){
    if(!live)return;
    const dt=Math.min(.04,Math.max(0,(now-prev)/1000));prev=now;
    const wheel=(keys.right?1:0)-(keys.left?1:0);
    steer+=(wheel-steer)*Math.min(1,dt*8);
    const nearest=nearestTrack(carX,carZ);
    const offroad=nearest.distance>roadWidth/2-1;
    if(!completed){
      const accel=keys.brake?-65:keys.gas?(offroad?11:29):-11;
      speed=Math.max(0,Math.min(offroad?80:190,speed+accel*dt));
      if(offroad)speed=Math.max(0,speed-19*dt);
      // Positive steering is right: yaw increases clockwise when viewed from above.
      // Heading stays unchanged if the driver releases the wheel; car continues straight.
      const turnRate=(speed/3.6)/10.5;
      heading+=steer*turnRate*dt*(offroad?.65:1);
      carX+=Math.sin(heading)*(speed/3.6)*dt;
      carZ+=Math.cos(heading)*(speed/3.6)*dt;
      lapTime+=dt;
      const curr=nearestTrack(carX,carZ);
      let delta=curr.u-lastTrackT;
      if(delta<-.5)delta+=1;
      if(delta>.5)delta-=1;
      // Only count forward finish-line crossings while on track.
      if(lastTrackT>.85&&curr.u<.15&&delta>0&&curr.distance<roadWidth/2+2){
        best=Math.min(best,lapTime);lapTime=0;lap++;if(lap>3){completed=true;speed=0}
      }
      lastTrackT=curr.u;
      t=curr.u;
    }
    const px=carX,pz=carZ,fx=Math.sin(heading),fz=Math.cos(heading),nx=fz,nz=-fx;
    const camera=cameraMode===0?[px-fx*10+nx*1.0,5.6,pz-fz*10+nz*1.0]:cameraMode===1?[px+fx*.8,1.65,pz+fz*.8]:[px-fx*19,11,pz-fz*19];
    const target=cameraMode===2?[px+fx*11,1.0,pz+fz*11]:[px+fx*18,1.5,pz+fz*18];
    const ratio=window.devicePixelRatio||1;
    const dw=Math.max(2,Math.round(canvas.clientWidth*Math.min(1.6,ratio))),dh=Math.max(2,Math.round(canvas.clientHeight*Math.min(1.6,ratio)));
    if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh}
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(.50,.72,.89,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    positions=[];colors=[];staticScene();
    if(cameraMode!==1)carMesh(px,pz,heading,col.car,1);
    for(let i=0;i<3;i++){
      const rt=(t+.18+i*.23)%1,r=track(rt);
      const lane=i%2?2.5:-2.5;
      carMesh(r.x+r.nx*lane,r.z+r.nz*lane,Math.atan2(r.tx,r.tz),i%2?col.yellow:col.red,.96);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,cb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(colors),gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,3,gl.FLOAT,false,0,0);
    gl.uniformMatrix4fv(uvp,false,mul(perspective(Math.PI/3,canvas.width/canvas.height,.1,650),lookAt(camera,target)));
    gl.drawArrays(gl.TRIANGLES,0,positions.length/3);
    speedEl.textContent=Math.round(speed);
    overlay.querySelector('#corsaGear').textContent=(speed<35?1:speed<65?2:speed<100?3:speed<145?4:5)+' ⚙';
    lapEl.textContent=completed?'🏁 CIEĽ · 3 kolá':'Kolo '+lap+'/3 · '+Math.floor(lapTime/60)+':'+(lapTime%60).toFixed(1).padStart(4,'0');
    bestEl.textContent='Najlepšie: '+(best===Infinity?'—':best.toFixed(1)+' s');
    raf=requestAnimationFrame(render);
  }
  raf=requestAnimationFrame(render);
}
