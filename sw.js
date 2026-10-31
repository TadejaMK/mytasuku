const CACHE='my-tasks-v14';
const NET_TIMEOUT=4000;

const ASSETS=[
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './tasky.ico'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>Promise.all(ASSETS.map(a=>c.add(a).catch(()=>{}))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

const store=(e,req,res)=>{
  if(res&&(res.status===200||res.type==='opaque')){
    const copy=res.clone();
    e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{}));
  }
  return res;
};

const withTimeout=(p,ms)=>Promise.race([
  p,
  new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))
]);

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;

  const url=new URL(req.url);

  if(url.origin===location.origin){
    e.respondWith(
      withTimeout(fetch(req),NET_TIMEOUT)
        .then(res=>store(e,req,res))
        .catch(()=>caches.match(req,{ignoreSearch:true}).then(hit=>
          hit||(req.mode==='navigate'?caches.match('./index.html'):Response.error())
        ))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit=>{
      const net=fetch(req).then(res=>store(e,req,res)).catch(()=>null);
      if(hit){e.waitUntil(net);return hit;}
      return net.then(res=>res||Response.error());
    })
  );
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      const c=list.find(x=>'focus' in x);
      return c?c.focus():self.clients.openWindow('./index.html');
    })
  );
});