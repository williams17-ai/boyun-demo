// Kumoma 雲間 — cinematic intro renderer (WebGL 1, hand-written shaders, no assets).
// Each scene is one fragment shader, a pure function of the scene-local time uT, so the app can seek, skip and freeze.
// Pipeline: scene (+ cross-fade from the previous scene) -> bright pass + 2x separable blur (bloom) -> grade, grain, vignette.
// If anything here fails (no WebGL, a shader does not compile, the GPU is too slow) the app falls back to its 2D canvas intro.
(()=>{
const VS="attribute vec2 a;varying vec2 vUv;void main(){vUv=a*.5+.5;gl_Position=vec4(a,0.,1.);}";
const COMMON=`
precision highp float;
uniform vec2 uRes;uniform float uT,uTime,uFade;varying vec2 vUv;
#define PI 3.14159265
float sat(float x){return clamp(x,0.,1.);}
float sm(float a,float b,float x){return smoothstep(a,b,x);}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n*37.+11.));}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,7.7);a*=.5;}return s;}
float fbm3(vec2 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,7.7);a*=.5;}return s;}
// out-of-focus discs (bokeh): soft, slightly brighter at the rim
float bokeh(vec2 p,float cell,float seed,float rmin,float rmax,float t){
  p/=cell;vec2 i=floor(p),f=fract(p);float s=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(float(x),float(y)),id=i+o,r=h22(id+seed);
    vec2 c=o+.5+(r-.5)*.8+.12*vec2(sin(t*.4+r.x*6.3),cos(t*.3+r.y*6.3));
    float rad=mix(rmin,rmax,h21(id+seed+9.1)),d=length(f-c);
    s+=sm(rad,rad*.7,d)*(.55+.45*sm(rad*.45,rad,d))*(.3+.7*h21(id+seed+3.7))*step(.45,r.x);}
  return s;}
// soft, defocused flecks (snow, dust): no hard rim
float flecks(vec2 p,float cell,float seed,float rmin,float rmax,float t){
  p/=cell;vec2 i=floor(p),f=fract(p);float s=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(float(x),float(y)),id=i+o,r=h22(id+seed);
    vec2 c=o+.5+(r-.5)*.8+.1*vec2(sin(t*.5+r.x*6.3),cos(t*.35+r.y*6.3));
    float rad=mix(rmin,rmax,h21(id+seed+9.1)),d=length(f-c)/rad;
    s+=exp(-d*d*2.2)*(.3+.7*h21(id+seed+3.7))*step(.4,r.x);}
  return s;}
// light shafts fanning out from a point
float rays(vec2 d,float t,float k){float a=atan(d.x,d.y);float r=vn(vec2(a*k,t*.12))*.6+vn(vec2(a*k*2.7+5.,t*.19))*.4;return r*r;}
float sdDrop(vec2 q,float r,float tear){
  if(tear<.02)return length(q)-r;
  q.x=abs(q.x);vec2 p=vec2(q.x,-q.y);float r2=r*.06,h=r*1.75*tear;
  float b=min((r-r2)/h,.999),a=sqrt(1.-b*b),k=dot(p,vec2(-b,a));
  if(k<0.)return length(p)-r;if(k>a*h)return length(p-vec2(0.,h))-r2;return dot(p,vec2(a,b))-r;}
`;
// needs: vec3 bg(vec2 p) — what the drop refracts
const DROP=`
vec3 drop(vec3 col,vec2 p,vec2 c,float r,float tear,float st,float alpha,vec3 lightCol,vec2 L){
  if(r<.0008||alpha<.004)return col;
  vec2 q=p-c;q.y/=(1.+st);float px=1.5/uRes.y,d=sdDrop(q,r,tear);
  col+=lightCol*.12*alpha*exp(-max(d,0.)/(r*1.5));
  if(d<px*2.){
    float e=r*.05;vec2 g=normalize(vec2(sdDrop(q+vec2(e,0.),r,tear)-sdDrop(q-vec2(e,0.),r,tear),sdDrop(q+vec2(0.,e),r,tear)-sdDrop(q-vec2(0.,e),r,tear))+1e-5);
    float k=sat(-d/r),z=sqrt(sat(1.-(1.-k)*(1.-k)));vec3 n=normalize(vec3(g*(1.-k)*1.1,z+.08));
    vec3 refr=bg(c-q*1.35+n.xy*r*1.2);                                   // the world upside-down inside the drop
    vec3 cd=refr*(.74+.3*z)+lightCol*.04;
    cd*=mix(.5,1.3,sm(-1.,1.,q.y/r));                                    // dark above, light pooled below
    cd=mix(cd,cd*.4,sm(.5,1.,1.-k)*.75);                                 // dark rim
    cd+=lightCol*sm(.16,0.,k)*(.08+.5*pow(abs(dot(g,normalize(L))),2.));  // bright edge where it faces / leaves the light
    cd+=lightCol*.07*z;
    cd+=lightCol*pow(1.-n.z,2.5)*.6;                                     // fresnel sheen
    vec3 Ld=normalize(vec3(L,.75));cd+=vec3(1.)*pow(sat(dot(reflect(-Ld,n),vec3(0.,0.,1.))),70.)*1.5;   // key highlight
    cd+=lightCol*pow(sat(dot(n.xy,-normalize(L))),2.5)*sm(0.,.5,k)*(1.-k)*1.5;                           // light gathered on the far side
    col=mix(col,cd,sm(px,-px,d)*alpha);}
  return col;}
`;
const MAIN=`
void main(){float asp=uRes.x/uRes.y;vec2 p=vec2((vUv.x-.5)*asp,1.-vUv.y);gl_FragColor=vec4(max(scene(p),0.),uFade);}
`;
// ---------------------------------------------------------------- scenes (p: x centred, y 0 top .. 1 bottom, in screen heights)
const S=[];
// 1 — mist: something gathers
S[0]=[`
vec3 bg(vec2 p){
  float t=uTime;vec2 lp=vec2(.07,-.2);
  vec3 col=mix(vec3(.30,.38,.46),vec3(.05,.08,.12),sm(-.05,1.05,p.y));          // cool dusk air
  float lit=exp(-length(p-lp)*1.5);
  col+=vec3(.60,.46,.26)*lit*.62;                                               // warm light above
  // three depths of mist, each drifting at its own pace
  vec2 w=vec2(fbm3(p*2.4+t*.02),fbm3(p*2.4+5.2-t*.015));
  float far=fbm(p*vec2(3.2,4.2)+w*.9+vec2(t*.015,0.));
  float mid=fbm(p*vec2(5.5,7.)+w*.5+vec2(-t*.03,t*.008)+7.3);
  float near=fbm3(p*vec2(2.,2.6)+vec2(t*.05,0.)+13.);
  col=mix(col,vec3(.50,.58,.66)*(.28+.95*lit),sm(.36,.72,far)*.7);
  col=mix(col,vec3(.90,.84,.72)*(.22+1.05*lit),sm(.44,.78,mid)*.55);
  vec2 d=p-lp;float ry=rays(d,t,9.)*sm(1.6,.05,length(d));
  col+=vec3(1.,.88,.66)*ry*.42*(.35+far*.9);                                    // shafts through the mist
  col=mix(col,vec3(.10,.13,.17),sm(.5,.85,near)*sm(.35,1.,p.y)*.6);             // dark, close mist low in frame
  return col;}
`,`
vec3 scene(vec2 p){
  float u=uT;vec2 c=vec2(0.,.40);
  float zoom=1.+.14*sm(0.,2.6,u);vec2 pp=c+(p-c)/zoom;                    // slow push-in
  vec3 col=bg(pp);
  col+=vec3(1.,.88,.66)*bokeh(pp+vec2(uTime*.012,-uTime*.006),.16,1.,.16,.34,uTime)*.16*sm(.95,.1,pp.y);   // out-of-focus glints in the light
  col+=vec3(.6,.75,.95)*bokeh(pp*1.3+vec2(-uTime*.02,0.),.3,4.,.3,.48,uTime)*.07;
  for(int i=0;i<18;i++){float fi=float(i);float pr=sm(.1,2.,u+h21(vec2(fi,3.))*.4),a=h21(vec2(fi,7.))*6.283+u*.3;
    float R=(.08+.17*h21(vec2(fi,11.)))*(1.-pr);vec2 m=c+vec2(cos(a),sin(a)*.8)*R;
    col+=vec3(1.,.95,.82)*exp(-length(pp-m)*(300.-150.*pr))*sin(PI*pr)*1.1;}          // motes drawn in
  float r=.024*sm(.4,2.05,u);
  col+=vec3(1.,.9,.7)*exp(-length(pp-c)*14.)*.3*sm(.2,2.,u);
  col=drop(col,pp,c,r,0.,0.,sm(.4,1.1,u),vec3(1.,.92,.76),vec2(-.45,-.8));
  return col;}
`];
// 2 — rain: falling with it, pausing on a leaf's tip
S[1]=[`
float rain(vec2 p,float sc,float sp,float seed,float len,float wid){     // slanted streaks, stretched by their own speed
  p.x-=p.y*.2;vec2 q=vec2(p.x*sc,p.y*sc*.1/len-uTime*sp);vec2 id=floor(q),f=fract(q);float h=h21(id+seed);
  float x=f.x-.2-h*.6;return sm(wid,0.,abs(x))*sm(0.,.85,f.y)*sm(1.,.93,f.y)*step(.55,h21(id+seed+4.))*(.4+.6*h);}
vec3 bg(vec2 p){
  float t=uTime;vec2 lp=vec2(-.14,-.08);float lit=exp(-length(p-lp)*1.6);
  vec3 col=mix(vec3(.09,.17,.19),vec3(.012,.03,.04),sm(0.,1.,p.y));
  col+=vec3(.34,.46,.44)*lit*.55;
  col+=vec3(.55,.40,.20)*exp(-length(p-vec2(.2,.12))*3.2)*.34;               // a low, warm break in the clouds
  float f=fbm(p*vec2(3.4,4.4)+vec2(t*.02,t*.03));
  col=mix(col,vec3(.30,.42,.43)*(.2+1.1*lit),sm(.4,.8,f)*.5);
  float fol=fbm3(p*vec2(5.,3.2)+3.);
  col=mix(col,vec3(.01,.03,.028),sm(.48,.7,fol)*sm(.2,.95,p.y)*.75);          // far, soft foliage shapes
  col+=vec3(.5,.78,.62)*bokeh(p,.13,2.,.13,.32,t)*.13*(.4+lit);              // wet leaves catching the light, out of focus
  col+=vec3(1.,.8,.5)*bokeh(p*1.4+3.,.19,5.,.1,.24,t)*.11*(.3+lit);
  vec2 d=p-lp;col+=vec3(.7,.9,.88)*rays(d,t,8.)*sm(1.4,.05,length(d))*.16;
  col+=vec3(.7,.82,.86)*rain(p,70.,2.6,1.,1.,.03)*.10;
  return col;}
`,`
vec3 scene(vec2 p){
  float u=uT,r=.027,px=1.5/uRes.y;vec2 c0=vec2(0.,.40);
  float sag=u<1.55?.012*sm(.6,.85,u):.012*exp(-(u-1.55)*5.)*cos((u-1.55)*18.);
  vec2 tip=vec2(.004,.50+sag);
  float cam=.10*sm(0.,2.4,u);                                               // the camera drifts down with the drop
  vec3 col=bg(c0+(p-c0)/1.14+vec2(0.,cam));
  col+=vec3(.72,.84,.88)*rain(p+vec2(0.,cam*.5),36.,3.4,7.,1.3,.045)*.17;
  // the leaf, reaching in from the right; sharp at the tip, soft where it leaves the focal plane
  vec2 base=vec2(.36,.455),ax=normalize(base-tip);float L=length(base-tip);
  vec2 q=p-tip;float a=dot(q,ax)/L,b=dot(q,vec2(-ax.y,ax.x));
  b+=.045*a*a-.012*sag/.012*a*(1.-a);                                        // gentle arch
  float w=.062*pow(sat(a),.55)*(1.-.3*a),nb=b/max(w,1e-4);
  float edge=mix(px,.02,sm(.35,1.1,a)),leaf=sm(edge,-edge,abs(b)-w)*step(0.,a);
  if(leaf>.001){
    float lit=exp(-length(p-vec2(-.14,-.08))*1.6);
    vec3 lc=mix(vec3(.035,.10,.06),vec3(.10,.24,.13),sat(.5-nb*.6))*(.55+.9*lit);      // folded along the midrib, lit from above
    float veins=sm(.06,0.,abs(fract(a*13.+abs(nb)*1.5)-.5))*.5*sm(.05,.4,a);
    lc*=1.-veins*.18;lc+=vec3(.18,.3,.2)*sm(.05,0.,abs(nb))*.5;                           // midrib
    float wet=fbm(vec2(a*7.,nb*1.6)+3.);
    lc+=vec3(.8,1.,.95)*pow(sat(1.-abs(nb+.4)*2.2),4.)*(.3+1.1*wet)*.9*(.4+lit);         // wet sheen along the upper face
    lc+=vec3(.9,1.,.97)*pow(sat(1.-abs(nb+.4)*5.),3.)*sm(.55,.75,wet)*.8;                // sharper glints in it
    lc+=vec3(.8,.95,.9)*bokeh(vec2(a*.5,nb*.05),.035,9.,.12,.3,0.)*.35*sm(.1,.5,a);      // beads of water
    lc+=vec3(.6,.85,.8)*sm(.75,1.,-nb)*.22;                                              // rim light on the upper edge
    col=mix(col,lc,leaf);}
  // the drop
  float x=0.,y,st=0.,tear;
  if(u<.7){float k=(u/.7)*(u/.7);y=mix(.40,tip.y+r*1.25,k);st=.22*k;tear=sm(0.,.3,u);}
  else if(u<1.55){y=tip.y+r*(1.25+.1*sin((u-.7)*9.));tear=.7;x=sin(u*38.)*.0015*sm(.85,1.05,u)*(1.-sm(1.35,1.55,u));}
  else{float k=(u-1.55)/.85;k*=k;y=mix(.50+r*1.25,.58,k);st=.26*k;tear=1.;}
  float hit=u-.7;if(hit>0.&&hit<.5)col+=vec3(.8,.95,.95)*exp(-abs(length((p-tip)*vec2(1.,2.2))-hit*.16)*160.)*(1.-hit*2.)*.5;   // a small ring of spray
  col=drop(col,p,vec2(x,y),r,tear,st,1.,vec3(.8,.98,.95),vec2(-.5,-.75));
  col+=vec3(.8,.9,.93)*rain(p*.6+vec2(.3,0.),13.,4.6,3.,1.8,.09)*.12;        // near rain, thick and blurred
  col=mix(col,vec3(.006,.02,.018),sm(.34,.1,length((p-vec2(-.3,1.05))*vec2(1.,.8)))*.92);   // a dark leaf very close to the lens
  return col;}
`];
// 3 — snow: high above it freezes, then quietly melts
S[2]=[`
float sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*sat(dot(pa,ba)/dot(ba,ba)));}
float sdFlake(vec2 q,float s){
  float a=atan(q.x,-q.y),r=length(q);a=mod(a+PI/6.,PI/3.)-PI/6.;vec2 f=vec2(abs(sin(a)),cos(a))*r;
  float d=sdSeg(f,vec2(0.),vec2(0.,s))-s*.018*(1.5-r/s);
  d=min(d,sdSeg(f,vec2(0.,s*.30),vec2(s*.16,s*.46))-s*.014);
  d=min(d,sdSeg(f,vec2(0.,s*.52),vec2(s*.2,s*.72))-s*.014);
  d=min(d,sdSeg(f,vec2(0.,s*.74),vec2(s*.11,s*.87))-s*.012);
  float hex=max(f.y,dot(f,vec2(.866,.5)))-s*.15;                           // small six-sided plate at the heart
  return min(d,hex);}
vec3 bg(vec2 p){
  float t=uTime;vec2 lp=vec2(.13,-.05);float lit=exp(-length(p-lp)*1.5);
  vec3 col=mix(vec3(.30,.40,.52),vec3(.04,.07,.13),sm(-.05,1.,p.y));
  col+=vec3(.70,.64,.56)*lit*.55;                                              // a pale winter sun behind the veil
  float f=fbm(p*vec2(3.,4.)+vec2(t*.015,t*.02));
  col=mix(col,vec3(.62,.70,.80)*(.25+lit),sm(.38,.78,f)*.55);
  col+=vec3(.85,.92,1.)*flecks(p+vec2(sin(t*.3)*.01,-t*.02),.06,2.,.05,.12,t)*.36;      // distant snow
  vec2 d=p-lp;col+=vec3(.8,.88,1.)*rays(d,t,7.)*sm(1.4,.05,length(d))*.14;
  return col;}
`,`
vec3 scene(vec2 p){
  float u=uT,px=1.5/uRes.y,t=uTime;vec2 c0=vec2(0.,.40);
  vec3 col=bg(c0+(p-c0)/1.14+vec2(0.,.10+.03*u));
  col+=vec3(.9,.95,1.)*flecks(p+vec2(sin(t*.5)*.015,-t*.045),.1,5.,.07,.17,t)*.42;     // mid snow
  vec2 c=vec2(sin(u*1.7)*.012*sm(.3,.8,u)*(1.-sm(1.9,2.4,u)),mix(.58,.62,u/2.4));
  float m=sm(.2,.75,u)*(1.-sm(1.55,2.1,u)),mm=4.*m*(1.-m);
  vec2 q=p-c;float ang=atan(q.x,-q.y);
  vec2 pw=c+q*(1.+.3*mm*cos(6.*ang));                                       // the drop pulls into six points as it freezes / lets go as it melts
  col=drop(col,pw,c,.027*(1.-.55*m),0.,0.,1.-sm(.55,1.,m),vec3(.85,.93,1.),vec2(.5,-.75));
  if(m>.01){
    float s=.034+.04*m,cs=cos(u*.5),sn=sin(u*.5);vec2 qr=vec2(q.x*cs-q.y*sn,q.x*sn+q.y*cs);
    float d=sdFlake(qr,s),k=sm(px,-px,d);
    float fac=fbm3(qr*160.+3.);
    vec3 ice=mix(vec3(.50,.66,.86),vec3(.86,.93,1.),sat(fac*1.4-.1))*(.82+.25*sm(s*.6,0.,length(qr)));   // translucent, faceted
    ice+=vec3(1.,.96,.88)*sm(.7,.9,fac)*.34;                                         // a few facets catch the light
    col=mix(col,ice,k*sm(.3,.85,m)*.92);
    col+=vec3(.6,.78,1.)*exp(-max(d,0.)*110.)*.22*m;                         // soft halo
    col+=vec3(.7,.84,1.)*exp(-length(q)*20.)*.16*m;}
  col+=vec3(.95,.97,1.)*flecks(p*.7+vec2(.2+sin(t*.4)*.02,-t*.06),.24,9.,.2,.4,t)*.2;    // snow close to the lens, very soft
  return col;}
`];
// 4 — one continuous descent: far mountains, the rock, the stream, under the sea, into the dark
S[3]=[`
float caus(vec2 q,float t){                                                    // moving light net on things under water
  vec2 p=mod(q*6.2832,6.2832)-250.,i=p;float c=1.;
  for(int n=0;n<4;n++){float tt=t*(1.-3.5/float(n+1));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+tt)/.005),p.y/(cos(i.y+tt)/.005)));}
  c=1.17-pow(c/4.,1.4);return pow(abs(c),8.);}
float camOff(){return sm(.35,3.85,uT)*3.2;}
vec3 bg(vec2 p){
  float t=uTime,off=camOff(),wy=p.y+off;vec3 col;
  if(wy<1.4){
    // dusk sky and four ridges, each sliding by at its own rate
    float sy=p.y+off*.5;
    col=mix(vec3(.13,.19,.32),vec3(.66,.50,.40),sm(-.15,.5,sy));
    vec2 sun=vec2(.09,.47-off*.5);float sd=length(p-sun);
    col+=vec3(1.,.66,.42)*exp(-sd*4.5)*.42+vec3(1.,.78,.58)*rays(p-sun,t,10.)*sm(.9,.05,sd)*.13;
    col+=vec3(.9,.75,.7)*sm(.5,.8,fbm(vec2(p.x*3.+t*.01,sy*9.)))*.12*sm(.5,.1,sy);      // thin high cloud
    for(int i=0;i<4;i++){float fi=float(i),ry=p.y+off*(.58+.1*fi);
      float h=.37+.05*fi-(fbm3(vec2(p.x*(2.2+fi*.9)+fi*7.3,fi*3.1))-.45)*(.13+.02*fi);
      float m=sm(0.,.004,ry-h);
      vec3 rc=mix(vec3(.46,.38,.44),vec3(.045,.06,.10),fi/3.);
      rc*=.82+.36*fbm3(vec2(p.x*14.+fi*5.,ry*26.));                                       // slopes, not flat card
      rc+=vec3(1.,.66,.42)*exp(-(ry-h)*60.)*.28*(1.-fi/4.);                               // the sun catching each crest
      rc=mix(rc,vec3(.74,.58,.52),sm(.02,.16,ry-h)*.55*(1.-fi/3.5));                      // mist pooling in the valleys
      col=mix(col,rc,m);}
    // the rock face: wet, with the crack the drop comes from
    float rt=.555+(fbm3(vec2(p.x*7.,2.))-.5)*.05;
    float rock=sm(0.,.006,wy-rt);
    if(rock>0.){
      float n=fbm(vec2(p.x*24.,wy*3.2)+3.),n2=fbm(vec2(p.x*70.,wy*14.)+9.);              // grain runs down the face
      float strata=fbm(vec2(p.x*3.+wy*1.5,wy*16.)+1.);
      vec3 rc=mix(vec3(.028,.036,.05),vec3(.12,.125,.14),sm(.3,.75,n*.7+strata*.4))*(.8+.35*n2);
      rc+=vec3(.55,.36,.24)*sm(.5,.9,n)*sm(-.25,.23,p.x)*.22;                             // warm side light from the sunset
      rc+=vec3(.9,.6,.4)*exp(-(wy-rt)*30.)*.35;                                          // last light on the top edge
      float cx=.002+(vn(vec2(wy*9.,1.))-.5)*.024,cd=abs(p.x-cx);
      rc*=1.-sm(.006,.001,cd)*.9;                                                         // the crack
      rc+=vec3(.45,.6,.7)*sm(.05,.0,cd)*sm(.55,.85,vn(vec2(p.x*60.,wy*6.-t*.5)))*.35;     // water running down beside it
      rc+=vec3(.5,.62,.7)*pow(n2,4.)*.5*sm(.3,.7,n);                                      // wet glints
      rc=mix(rc,vec3(.45,.56,.6),sm(1.25,1.37,wy)*.6);                                    // spray where it meets the stream
      col=mix(col,rc,rock);}
  }
  if(wy>1.33&&wy<1.76){
    // the stream, running off to the right
    float f1=fbm(vec2(p.x*2.2-t*.7,wy*34.)),f2=fbm(vec2(p.x*4.-t*1.3,wy*90.)+5.),f3=fbm3(vec2(p.x*7.-t*2.,wy*170.)+2.);
    vec3 wc=mix(vec3(.025,.10,.14),vec3(.16,.33,.38),f1);
    wc+=vec3(.95,.74,.55)*pow(sm(.5,.8,f2),2.)*.42*(1.-sm(1.36,1.7,wy)*.6);              // the sky drawn out along the current
    wc+=vec3(.85,.95,.97)*sm(.66,.8,f3)*sm(.45,.7,f1)*.5;                                // fine glints
    col=mix(col,wc,sm(1.34,1.38,wy));}
  if(wy>1.7){
    float sl=1.72+.004*sin(p.x*42.+t*2.)+.003*sin(p.x*17.-t*1.3),d=wy-sl;
    if(d>0.){
      vec3 uc=mix(vec3(.08,.34,.42),vec3(.015,.09,.19),sm(0.,.9,d));
      uc=mix(uc,vec3(0.,.008,.025),sm(.7,2.,d));
      uc+=vec3(.5,.9,.9)*caus(vec2(p.x*2.2,wy*1.6),t)*.5*exp(-d*2.4);                    // caustics near the surface
      float sh=vn(vec2((p.x-d*.22)*13.,t*.25));uc+=vec3(.35,.75,.8)*sh*sh*exp(-d*1.5)*.33;   // shafts of light slanting down
      uc+=vec3(.6,.85,.9)*flecks(vec2(p.x,wy),.05,3.,.04,.09,t)*.3*exp(-d*.9);           // drifting particles
      uc+=vec3(.6,.8,.85)*flecks(vec2(p.x*.6,wy*.6)+.3,.16,8.,.12,.25,t)*.09*exp(-d*.7);
      uc*=1.-sm(1.7,2.45,d);
      uc+=vec3(.75,.95,1.)*exp(-d*140.)*.6;                                               // the bright skin of the water
      col=uc;}}
  return col;}
`,`
vec3 scene(vec2 p){
  float u=uT,off=camOff(),r=.027;
  vec3 col=bg(p);
  float y=mix(.62,.45,sm(.3,1.4,u)),depth=y+off,under=sm(1.72,1.76,depth);
  float hit=u-1.9;if(hit>0.&&hit<.9){vec2 q=p-vec2(0.,1.722-off);                         // rings where it went in
    col+=vec3(.8,.95,1.)*exp(-abs(length(q*vec2(1.,5.))-hit*.22)*70.)*(1.-hit/.9)*.6;}
  float a=1.-.9*sm(2.0,3.9,depth);
  col=drop(col,p,vec2(0.,y),r*(1.+.05*sin(u*3.)*(1.-sm(.2,.4,u))),mix(u<.35?.75:1.,0.,under),(u>.35?.2:0.)*(1.-under),a,mix(vec3(.72,.6,.5),vec3(.55,.9,.95),under),vec2(-.3,-.85));
  col+=vec3(.5,.85,.9)*exp(-length(p-vec2(0.,y))*22.)*.1*under*a;
  return col*(1.-sm(3.65,4.,u));}
`];
// shared by 5 and 6: a layered night sky and the sea of cloud below it
const SKY=`
float starL(vec2 p,float sc,float seed,float t){vec2 q=p*sc,i=floor(q),f=fract(q)-.5,r=h22(i+seed);
  float d=length(f-(r-.5)*.7),tw=.72+.28*sin(t*(1.+r.y*3.)+r.x*40.);
  return step(.7,r.x)*tw*exp(-d*d*(240.+700.*r.y))*(.35+.65*r.y);}
vec3 night(vec2 p,float t,float starA){
  vec3 col=mix(vec3(.010,.016,.042),vec3(.05,.085,.19),sm(0.,.72,p.y));
  float n=fbm(p*2.3+3.),n2=fbm(p*4.2+n*1.6+8.);
  col+=(vec3(.09,.15,.32)*sm(.38,.8,n)+vec3(.20,.11,.28)*sm(.5,.9,n2)*.6)*.55*starA;             // a faint nebula
  float s=starL(p,34.,1.,t)*.9+starL(p,64.,5.,t)*.65+starL(p,115.,9.,t)*.45;                     // far, farther, farthest
  col+=(vec3(.82,.9,1.)*s+vec3(1.,.94,.82)*starL(p,13.,3.,t)*1.5)*starA*sm(.74,.4,p.y);
  return col;}
// sea of cloud with an opening in the middle; the light below gilds the edge of the opening
vec3 sea(vec3 col,vec2 p,float seaY,float gap,float t,float a,float glow){
  float top=seaY+(fbm3(vec2(p.x*5.+t*.02,1.3))-.5)*.05,dd=p.y-top;
  vec2 gc=vec2(0.,seaY+.035);vec2 e=(p-gc)/vec2(max(gap,.001),max(gap,.001)*.36);
  float g=length(e)+(fbm3(p*16.+t*.04)-.5)*.55;
  if(gap>.002){
    col+=vec3(1.,.93,.78)*exp(-g*g*1.2)*.44*glow*a;                                               // the light in the gap
    float up=gc.y-p.y;if(up>0.)col+=vec3(1.,.9,.7)*exp(-abs(p.x)/(gap*.5+up*.3))*exp(-up*3.2)*(.5+.5*vn(vec2(p.x*30.,t*.3)))*.2*glow*a;}   // and rising from it
  if(dd>-.02){
    float n=fbm(vec2(p.x*(6.-2.5*sat(dd*3.)),dd*10.)+vec2(t*.012,0.)+fbm3(p*3.)*.5);
    vec3 cc=mix(vec3(.045,.07,.14),vec3(.44,.52,.68),sm(.3,.82,n));
    cc+=vec3(.5,.62,.85)*exp(-max(dd,0.)*26.)*.38;                                              // starlight along the tops
    float hole=gap>.002?sm(1.,.5,g):0.;
    float rim=sm(.62,.98,g)*sm(1.32,1.,g)*step(.002,gap);
    cc+=vec3(1.,.76,.40)*rim*(.2+1.3*n*n)*(.45+.75*sm(-.6,.9,e.y))*.7*glow;                    // gold edge, strongest on the near side                                               // gold edge
    cc+=vec3(1.,.82,.58)*exp(-g*.55)*.2*n*glow*step(.002,gap);                                 // and warming the clouds around it
    col=mix(col,cc,sm(-.02,.03,dd)*(1.-hole)*a);}
  return col;}
`;
// 5 — light, and the way up: through the water, through the clouds, to the stars
S[4]=[`
float caus(vec2 q,float t){
  vec2 p=mod(q*6.2832,6.2832)-250.,i=p;float c=1.;
  for(int n=0;n<4;n++){float tt=t*(1.-3.5/float(n+1));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+tt)/.005),p.y/(cos(i.y+tt)/.005)));}
  c=1.17-pow(c/4.,1.4);return pow(abs(c),8.);}
`+SKY+`
vec3 bg(vec2 p){
  float u=uT,t=uTime,top=mix(3.3,.9,sm(1.5,2.5,u)),wy=p.y+top;
  float sl=1.72+.004*sin(p.x*42.+t*2.)+.003*sin(p.x*17.-t*1.3),d=wy-sl;vec3 col;
  if(d>0.){
    col=mix(vec3(.08,.34,.42),vec3(.015,.09,.19),sm(0.,.9,d));
    col=mix(col,vec3(0.,.008,.025),sm(.7,2.,d));
    col+=vec3(.5,.9,.9)*caus(vec2(p.x*2.2,wy*1.6),t)*.5*exp(-d*2.4);
    float sh=vn(vec2((p.x-d*.22)*13.,t*.25));col+=vec3(.35,.75,.8)*sh*sh*exp(-d*1.5)*.33;
    col+=vec3(.6,.85,.9)*flecks(vec2(p.x,wy),.05,3.,.04,.09,t)*.3*exp(-d*.9);
    col*=1.-sm(1.7,2.45,d)*.97;
    float beam=sm(.1,1.,u)*(1.-sm(2.3,2.9,u)),bw=.035+p.y*.2,b=exp(-pow(abs(p.x)/bw,2.)*1.3);     // the light finds it
    float fl=.55+.45*vn(vec2(p.x/bw*2.5,t*.5))+.6*caus(vec2(p.x*3.,p.y*2.+t*.05),t);
    col+=vec3(.45,.82,.9)*b*fl*beam*(.62-.42*p.y);
    col+=vec3(.7,.92,1.)*flecks(p+vec2(0.,t*.02),.045,6.,.04,.1,t)*b*beam*.5;                     // dust lit inside the shaft
    col+=vec3(.75,.95,1.)*exp(-d*120.)*.7;
  }else col=mix(vec3(.50,.56,.62),vec3(.66,.70,.74),sat(-d*2.));
  float c0=sm(2.1,2.45,u);
  if(c0>0.){
    float k=sm(2.5,3.9,u),R=3.6*sm(2.1,3.95,u),cf=1.-sm(3.3,3.95,u);
    vec3 cc=mix(mix(vec3(.30,.42,.60),vec3(.62,.70,.80),p.y),night(p,t,sm(3.2,4.4,u)),k);    // blue between the clouds
    cc+=vec3(1.,.93,.8)*exp(-length(p-vec2(.05,-.1))*2.2)*.3*(1.-k);                             // the sun somewhere above the cloud
    float rush=sm(2.3,2.9,u)*(1.-sm(3.2,3.8,u));
    for(int i=0;i<3;i++){float fi=float(i);vec2 q=vec2(p.x*(2.2+fi*1.3),(p.y-R*(1.+.55*fi))*(1.3+fi*.5)*(1.-.45*rush))+fi*9.7;   // stretched by speed
      float n=fbm(q+fbm3(q*.7+2.)*.7),up=fbm3(q*1.3+vec2(0.,-.22)+4.);
      vec3 lc=mix(vec3(.17,.22,.32),vec3(1.,.99,.96),sm(.3,.95,n*.6+(n-up+.5)*.5));              // billows: lit from above, blue in the folds
      lc*=mix(1.,.5,k);
      cc=mix(cc,lc,sm(.46,.66,n)*(.95-.15*fi)*cf);}
    cc=sea(cc,p,.72,0.,t,sm(3.4,4.3,u),0.);
    col=mix(col,cc,c0);}
  return col;}
`,`
vec3 scene(vec2 p){
  float u=uT;vec2 c=vec2(0.,mix(.45,.40,sm(1.,2.2,u)));float vap=sm(1.,1.8,u);
  vec3 col=bg(p);
  col=drop(col,p,c,.027*(1.-.6*vap),0.,0.,sm(.3,.9,u)*(1.-vap),vec3(.7,.95,1.),vec2(0.,-1.));
  for(int i=0;i<16;i++){float fi=float(i),a=u-1.-h21(vec2(fi,2.))*.9;if(a>0.&&a<1.6){                 // the drop lets go, as vapour
    vec2 m=c+vec2(sin(a*3.+fi)*.012*a+(h21(vec2(fi,5.))-.5)*.016,-a*(.045+.05*h21(vec2(fi,8.))));
    col+=vec3(.85,.95,1.)*exp(-length(p-m)*(110.-40.*a))*(1.-a/1.6)*.5;}}
  float l=length(p-c);col+=vec3(1.,.95,.8)*(exp(-l*130.)*.9+exp(-l*24.)*.1)*vap;                     // what is left is a point of light
  return col;}
`];
// 6 — the name, and the way in: stars above, the clouds opening below
S[5]=[SKY+`
float seaY(){return mix(.72,.66,sm(0.,1.2,uT));}
float breath(){float u=uT;return u<1.4?1.:1.+.16*(.5-.5*cos(6.2832*(u-1.4)/4.2));}                   // in step with the button
vec3 bg(vec2 p){
  float u=uT,t=uTime,asp=uRes.x/uRes.y;
  vec3 col=night(p,t,1.);
  return sea(col,p,seaY(),asp*(.05+.27*sm(.2,1.9,u)),t,1.,breath());}
`,`
vec3 scene(vec2 p){
  float u=uT;vec2 gc=vec2(0.,seaY()+.035);
  float zoom=1.+.05*sm(0.,6.,u);vec2 pp=gc+(p-gc)/zoom;                    // drifting slowly toward the light
  vec3 col=bg(pp);
  vec2 c=vec2(0.,mix(.40,gc.y,sm(.15,1.6,u)));float l=length(pp-c);
  col+=vec3(1.,.95,.8)*(exp(-l*130.)*.9+exp(-l*24.)*.1)*(1.-sm(1.2,1.7,u));
  return col;}
`];
// ---------------------------------------------------------------- post
const FS_BLUR=`precision highp float;uniform sampler2D uTex;uniform vec2 uDir;uniform float uThr;varying vec2 vUv;
vec3 tap(vec2 o){vec3 c=texture2D(uTex,vUv+o).rgb;return uThr>0.?max(c-uThr,0.)*1.7:c;}
void main(){vec3 c=tap(vec2(0.))*.227;c+=(tap(uDir*1.385)+tap(-uDir*1.385))*.316;c+=(tap(uDir*3.231)+tap(-uDir*3.231))*.0703;gl_FragColor=vec4(c,1.);}`;
const FS_FINAL=`precision highp float;uniform sampler2D uScene,uBloom;uniform vec2 uRes;uniform float uTime;varying vec2 vUv;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){vec2 d=vUv-.5;float r2=dot(d,d);vec2 ca=d*r2*.014;
  vec3 c=vec3(texture2D(uScene,vUv+ca).r,texture2D(uScene,vUv).g,texture2D(uScene,vUv-ca).b);
  c+=texture2D(uBloom,vUv).rgb*.6;
  c=c/(1.+c*.18)*1.14;                                              // soft shoulder
  c=mix(c,c*c*(3.-2.*c),.55);                                       // gentle S-curve
  c=mix(vec3(dot(c,vec3(.299,.587,.114))),c,1.12);
  c*=mix(vec3(1.),vec3(.96,.99,1.04),smoothstep(.5,0.,dot(c,vec3(.333))));    // cool the shadows a touch
  c*=1.-smoothstep(.28,.98,length(d*vec2(.95,1.)))*.5;                // vignette
  c+=(h21(vUv*uRes+fract(uTime*7.)*91.7)-.5)*.035;                    // fine grain
  gl_FragColor=vec4(c,1.);}`;

function create(canvas,opt){
  opt=opt||{};let gl;
  try{const at={alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,powerPreference:"high-performance",failIfMajorPerformanceCaveat:!opt.force};
    gl=canvas.getContext("webgl",at)||canvas.getContext("experimental-webgl",at);}catch(e){}
  if(!gl)return null;
  const hp=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);if(!hp||!hp.precision)return null;   // the noise needs highp
  let dead=false;
  function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn("intro-gl shader:",gl.getShaderInfoLog(s));return null;}return s;}
  const vs=sh(gl.VERTEX_SHADER,VS);
  function prog(fs){const f=sh(gl.FRAGMENT_SHADER,fs);if(!vs||!f)return null;const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,f);gl.bindAttribLocation(p,0,"a");gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){console.warn("intro-gl link:",gl.getProgramInfoLog(p));return null;}
    const u={};for(const n of["uRes","uT","uTime","uFade","uTex","uDir","uThr","uScene","uBloom"])u[n]=gl.getUniformLocation(p,n);return{p,u};}
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const pBlur=prog(FS_BLUR),pFinal=prog(FS_FINAL);if(!pBlur||!pFinal)return null;
  const scenes=[];
  function scene(i){if(scenes[i]===undefined){scenes[i]=S[i]?prog(COMMON+S[i][0]+DROP+S[i][1]+MAIN):null;if(!scenes[i])dead=true;}return scenes[i];}
  if(!scene(0))return null;
  function target(){const t=gl.createTexture(),f=gl.createFramebuffer();return{t,f,w:0,h:0};}
  function sizeT(o,w,h){o.w=w;o.h=h;gl.bindTexture(gl.TEXTURE_2D,o.t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const[k,v]of[[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    gl.bindFramebuffer(gl.FRAMEBUFFER,o.f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,o.t,0);}
  const A=target(),B=target(),C=target();let W=0,H=0,budget=opt.pixels||520000,starts=opt.starts||[0,2.4,4.8,7.2,12.2,16.6];
  function resize(){
    const cw=canvas.clientWidth||innerWidth,ch=canvas.clientHeight||innerHeight,d=Math.min(devicePixelRatio||1,2);
    const k=Math.min(d,Math.sqrt(budget/(cw*ch)));W=Math.max(2,Math.round(cw*k));H=Math.max(2,Math.round(ch*k));
    canvas.width=W;canvas.height=H;sizeT(A,W,H);sizeT(B,Math.max(2,W>>2),Math.max(2,H>>2));sizeT(C,Math.max(2,W>>2),Math.max(2,H>>2));
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)dead=true;}
  function pass(P,dst,w,h,set){gl.bindFramebuffer(gl.FRAMEBUFFER,dst);gl.viewport(0,0,w,h);gl.useProgram(P.p);set(P.u);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
  function tex(unit,t,loc){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(loc,unit);}
  function drawScene(i,u,t,fade){const P=scene(i);if(!P)return;
    pass(P,A.f,W,H,U=>{gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,u);gl.uniform1f(U.uTime,t);gl.uniform1f(U.uFade,fade);});}
  function draw(t){
    if(dead||gl.isContextLost())return false;
    if(!W)resize();
    let i=0;for(let k=0;k<starts.length;k++)if(t>=starts[k])i=k;
    const u=t-starts[i];
    gl.disable(gl.BLEND);
    if(i>0&&i!==4&&u<.6){drawScene(i-1,starts[i]-starts[i-1],t,1);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      const x=Math.min(1,u/.6);drawScene(i,u,t,x*x*(3-2*x));gl.disable(gl.BLEND);}
    else drawScene(i,u,t,1);
    if(dead)return false;
    const bw=B.w,bh=B.h;
    pass(pBlur,B.f,bw,bh,U=>{tex(0,A.t,U.uTex);gl.uniform2f(U.uDir,1.6/bw,0);gl.uniform1f(U.uThr,.6);});
    pass(pBlur,C.f,bw,bh,U=>{tex(0,B.t,U.uTex);gl.uniform2f(U.uDir,0,1.6/bh);gl.uniform1f(U.uThr,0);});
    pass(pBlur,B.f,bw,bh,U=>{tex(0,C.t,U.uTex);gl.uniform2f(U.uDir,3.4/bw,0);gl.uniform1f(U.uThr,0);});
    pass(pBlur,C.f,bw,bh,U=>{tex(0,B.t,U.uTex);gl.uniform2f(U.uDir,0,3.4/bh);gl.uniform1f(U.uThr,0);});
    pass(pFinal,null,W,H,U=>{tex(0,A.t,U.uScene);tex(1,C.t,U.uBloom);gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uTime,t);});
    return true;}
  let warm=1;function prewarm(){if(dead||warm>=S.length)return;scene(warm++);setTimeout(prewarm,250);}   // compile the later scenes between frames
  setTimeout(prewarm,400);
  canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();dead=true;});
  return{draw,resize,lower(){if(budget<=260000)return false;budget=260000;resize();return true;},get dead(){return dead},get size(){return[W,H]}};
}
window.KumomaGL={create};
})();
