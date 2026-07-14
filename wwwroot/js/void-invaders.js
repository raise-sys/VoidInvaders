window.voidInvaders = (() => {
    let canvas, ctx, frame, last = 0, audio;
    const W = 720, H = 800;
    const keys = { left: false, right: false, fire: false };
    const stars = Array.from({ length: 80 }, (_, i) => ({ x: (i * 89) % W, y: (i * 137) % H, a: .12 + (i % 5) * .05 }));
    const sprites = {
        squid: ['0011001100','0001111000','0011111100','0110110110','1111111111','1011111101','1010000101','0001100000'],
        crab:  ['0010000100','0001001000','0011111100','0110110110','1111111111','1011111101','1010000101','0100000010'],
        octo:  ['0001111000','0111111110','1111111111','1100110011','1111111111','0011001100','0110110110','1100000011'],
        player:['00000100000','00001110000','00001110000','01111111110','11111111111','11111111111'],
        ufo:   ['000011110000','001111111100','011011110110','111111111111','001100001100']
    };
    let game;

    function resetGame() {
        game = {
            state: 'title', score: 0, hi: +(localStorage.getItem('voidInvadersHi') || 0), lives: 3, wave: 1,
            player: { x: W / 2 - 22, y: 708, w: 44, h: 24, cooldown: 0, inv: 0 },
            enemies: [], shots: [], bombs: [], particles: [], shields: [], ufo: null,
            enemyDir: 1, enemyStep: 0, marchTimer: 0, bombTimer: 1, ufoTimer: 12,
            message: '', messageTimer: 0, shake: 0
        };
        buildWave();
    }

    function buildWave() {
        game.enemies = [];
        for (let row = 0; row < 5; row++) for (let col = 0; col < 11; col++) {
            game.enemies.push({ x: 91 + col * 49, y: 180 + row * 45, w: 34, h: 27, row, col, alive: true });
        }
        game.shots = []; game.bombs = []; game.enemyDir = 1; game.marchTimer = 0;
        game.player.x = W / 2 - 22; game.player.y = 708; game.player.inv = 1.4;
        buildShields();
        game.message = `WAVE ${String(game.wave).padStart(2, '0')}`; game.messageTimer = 1.7;
    }

    function buildShields() {
        game.shields = [];
        [130, 280, 430, 580].forEach(cx => {
            for (let r = 0; r < 7; r++) for (let c = 0; c < 12; c++) {
                const cut = (r < 2 && (c < 2 - r || c > 9 + r)) || (r > 4 && c > 3 && c < 8);
                if (!cut) game.shields.push({ x: cx - 36 + c * 6, y: 632 + r * 6, hp: 2 });
            }
        });
    }

    function start() {
        if (game.state === 'title' || game.state === 'gameover') {
            const hi = game.hi; resetGame(); game.hi = hi; game.state = 'playing'; unlockAudio(); beep(110, .06, 'square', .03); canvas.focus();
        }
    }

    function update(dt) {
        if (!game || game.state !== 'playing') return;
        const p = game.player;
        p.cooldown -= dt; p.inv = Math.max(0, p.inv - dt);
        game.messageTimer = Math.max(0, game.messageTimer - dt);
        if (keys.left) p.x -= 270 * dt;
        if (keys.right) p.x += 270 * dt;
        p.x = Math.max(30, Math.min(W - 30 - p.w, p.x));
        if (keys.fire && p.cooldown <= 0 && game.shots.length < 2) {
            game.shots.push({ x: p.x + p.w / 2 - 2, y: p.y - 10, w: 4, h: 14 });
            p.cooldown = .32; beep(620, .045, 'square', .035);
        }

        const alive = game.enemies.filter(e => e.alive);
        const interval = Math.max(.07, .62 * (alive.length / 55)) / (1 + (game.wave - 1) * .08);
        game.marchTimer += dt;
        if (game.marchTimer >= interval && alive.length) {
            game.marchTimer = 0;
            const minX = Math.min(...alive.map(e => e.x)), maxX = Math.max(...alive.map(e => e.x + e.w));
            if ((game.enemyDir > 0 && maxX >= W - 35) || (game.enemyDir < 0 && minX <= 35)) {
                game.enemyDir *= -1; alive.forEach(e => e.y += 18);
            } else alive.forEach(e => e.x += 9 * game.enemyDir);
            game.enemyStep++;
            beep(game.enemyStep % 4 < 2 ? 66 : 58, .045, 'square', .018);
        }

        game.bombTimer -= dt;
        if (game.bombTimer <= 0 && alive.length) {
            const columns = [...new Set(alive.map(e => e.col))];
            const col = columns[Math.floor(Math.random() * columns.length)];
            const shooter = alive.filter(e => e.col === col).sort((a,b) => b.y - a.y)[0];
            game.bombs.push({ x: shooter.x + shooter.w / 2, y: shooter.y + shooter.h, w: 5, h: 15, phase: Math.random() * 6 });
            game.bombTimer = Math.max(.28, 1.05 - game.wave * .06) * (.6 + Math.random() * .8);
        }

        game.ufoTimer -= dt;
        if (!game.ufo && game.ufoTimer <= 0) {
            const fromLeft = Math.random() > .5;
            game.ufo = { x: fromLeft ? -55 : W + 5, y: 128, w: 48, h: 20, vx: fromLeft ? 85 : -85 };
            game.ufoTimer = 17 + Math.random() * 10;
            beep(185, .12, 'sawtooth', .022);
        }
        if (game.ufo) { game.ufo.x += game.ufo.vx * dt; if (game.ufo.x < -70 || game.ufo.x > W + 70) game.ufo = null; }

        game.shots.forEach(s => s.y -= 520 * dt);
        game.bombs.forEach(b => { b.y += (175 + game.wave * 7) * dt; b.phase += dt * 18; });
        game.particles.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 60 * dt; q.life -= dt; });
        game.particles = game.particles.filter(q => q.life > 0);
        collisions();
        game.shots = game.shots.filter(s => s.y > 85 && !s.dead);
        game.bombs = game.bombs.filter(b => b.y < 755 && !b.dead);
        game.shields = game.shields.filter(b => b.hp > 0);
        game.shake = Math.max(0, game.shake - dt * 18);

        if (alive.some(e => e.y + e.h >= 625)) loseLife(true);
        if (!game.enemies.some(e => e.alive)) {
            game.wave++; buildWave(); beep(440, .1, 'square', .04); setTimeout(() => beep(660, .16, 'square', .035), 100);
        }
    }

    function collisions() {
        for (const s of game.shots) {
            for (const e of game.enemies) if (e.alive && hit(s, e)) {
                s.dead = true; e.alive = false;
                addScore(e.row === 0 ? 30 : e.row < 3 ? 20 : 10);
                burst(e.x + e.w / 2, e.y + e.h / 2, '#78ff96', 10); beep(150 + e.row * 30, .09, 'sawtooth', .04); break;
            }
            if (!s.dead && game.ufo && hit(s, game.ufo)) {
                s.dead = true; const bonus = [50, 100, 150, 300][Math.floor(Math.random() * 4)]; addScore(bonus);
                game.message = `${bonus} BONUS`; game.messageTimer = 1.2; burst(game.ufo.x + 24, game.ufo.y + 10, '#ff5c72', 18); game.ufo = null; game.shake = 5; beep(95, .18, 'sawtooth', .06);
            }
            if (!s.dead) shieldHit(s);
        }
        for (const b of game.bombs) {
            shieldHit(b);
            if (!b.dead && game.player.inv <= 0 && hit(b, game.player)) { b.dead = true; loseLife(false); }
        }
        // Invaders grind away the shields when they reach them.
        for (const e of game.enemies) if (e.alive && e.y > 590) for (const b of game.shields) if (hit(e, {x:b.x,y:b.y,w:6,h:6})) b.hp = 0;
    }

    function shieldHit(projectile) {
        for (const b of game.shields) if (b.hp > 0 && hit(projectile, {x:b.x,y:b.y,w:6,h:6})) {
            projectile.dead = true; b.hp--; burst(projectile.x, projectile.y, '#6af08c', 3); return true;
        }
        return false;
    }
    function hit(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
    function addScore(n) { game.score += n; if (game.score > game.hi) { game.hi = game.score; localStorage.setItem('voidInvadersHi', game.hi); } }
    function loseLife(overrun) {
        if (game.player.inv > 0) return;
        burst(game.player.x + 22, game.player.y + 10, '#ffdf75', 24); game.shake = 11; game.lives--; game.bombs = [];
        beep(55, .35, 'sawtooth', .07);
        if (game.lives <= 0 || overrun) { game.state = 'gameover'; game.message = 'GAME OVER'; }
        else { game.player.x = W / 2 - 22; game.player.inv = 2; }
    }
    function burst(x,y,color,n) { for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, v=30+Math.random()*100; game.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.25+Math.random()*.45,color}); } }

    function draw() {
        if (!ctx || !game) return;
        ctx.save();
        if (game.shake) ctx.translate((Math.random()-.5)*game.shake, (Math.random()-.5)*game.shake);
        ctx.fillStyle = '#010504'; ctx.fillRect(0,0,W,H);
        stars.forEach(s => { ctx.globalAlpha=s.a; ctx.fillStyle='#a7ffba'; ctx.fillRect(s.x,s.y,1,1); }); ctx.globalAlpha=1;
        drawHud();
        if (game.state === 'title') drawTitle(); else drawWorld();
        if (game.state === 'paused') overlay('PAUSED', 'P で再開');
        if (game.state === 'gameover') { drawWorld(); overlay('GAME OVER', `SCORE  ${pad(game.score)}  //  CLICK TO RETRY`); }
        ctx.restore();
    }

    function drawHud() {
        ctx.textBaseline='top'; ctx.font='16px "Share Tech Mono", monospace'; ctx.fillStyle='#839b89';
        ctx.fillText('SCORE', 34, 28); ctx.textAlign='center'; ctx.fillText('HI-SCORE', W/2, 28); ctx.textAlign='right'; ctx.fillText(`WAVE  ${String(game.wave).padStart(2,'0')}`, W-34, 28);
        ctx.font='24px "Share Tech Mono", monospace'; ctx.fillStyle='#dbffe2'; ctx.textAlign='left'; ctx.fillText(pad(game.score),34,49); ctx.textAlign='center'; ctx.fillStyle='#ffdf75';ctx.fillText(pad(game.hi),W/2,49);
        ctx.strokeStyle='#173522';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(30,88);ctx.lineTo(W-30,88);ctx.stroke();ctx.textAlign='left';
    }

    function drawTitle() {
        ctx.textAlign='center';
        ctx.fillStyle='#78ff96'; ctx.font='bold 54px "Share Tech Mono", monospace'; ctx.fillText('VOID',W/2,155);
        ctx.fillStyle='#dfffe5'; ctx.font='bold 63px "Share Tech Mono", monospace'; ctx.fillText('INVADERS',W/2,210);
        drawSprite(sprites.squid,W/2-30,310,6,'#78ff96');
        ctx.font='18px "Share Tech Mono", monospace'; ctx.fillStyle='#809388';ctx.fillText('MYSTERY  =  ?  PTS',W/2,394);
        drawSprite(sprites.squid,230,432,3,'#78ff96'); ctx.fillText('= 30 PTS',385,436);
        drawSprite(sprites.crab,230,477,3,'#78ff96'); ctx.fillText('= 20 PTS',385,481);
        drawSprite(sprites.octo,230,522,3,'#78ff96'); ctx.fillText('= 10 PTS',385,526);
        const blink = Math.floor(performance.now()/550)%2===0;
        if(blink){ctx.fillStyle='#ffdf75';ctx.font='22px "Share Tech Mono", monospace';ctx.fillText('CLICK OR PRESS SPACE',W/2,620);}
        ctx.font='14px "Share Tech Mono", monospace';ctx.fillStyle='#526359';ctx.fillText('1 PLAYER  //  SURVIVE THE SWARM',W/2,670);ctx.textAlign='left';
    }

    function drawWorld() {
        if (game.ufo) drawSprite(sprites.ufo,game.ufo.x,game.ufo.y,4,'#ff5c72');
        for (const e of game.enemies) if(e.alive) {
            const type=e.row===0?'squid':e.row<3?'crab':'octo';
            drawSprite(sprites[type],e.x,e.y,3.4,'#78ff96',game.enemyStep%2);
        }
        for (const b of game.shields) {ctx.fillStyle=b.hp===2?'#66e986':'#357849';ctx.fillRect(b.x,b.y,6,6);}
        for (const s of game.shots) {ctx.fillStyle='#f7fff8';ctx.shadowColor='#baffc8';ctx.shadowBlur=8;ctx.fillRect(s.x,s.y,s.w,s.h);ctx.shadowBlur=0;}
        for (const b of game.bombs) {ctx.fillStyle='#ffdf75';ctx.fillRect(b.x + Math.sin(b.phase)*2,b.y,b.w,b.h);}
        if(game.player.inv<=0 || Math.floor(game.player.inv*10)%2===0) drawSprite(sprites.player,game.player.x,game.player.y,4,'#c8ffd4');
        for(const q of game.particles){ctx.globalAlpha=Math.max(0,q.life*2);ctx.fillStyle=q.color;ctx.fillRect(q.x,q.y,3,3);}ctx.globalAlpha=1;
        ctx.strokeStyle='#78ff96';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(28,748);ctx.lineTo(W-28,748);ctx.stroke();
        ctx.font='17px "Share Tech Mono", monospace';ctx.fillStyle='#b7d9bf';ctx.fillText(`${game.lives}`,34,762);
        for(let i=0;i<Math.max(0,game.lives-1);i++)drawSprite(sprites.player,60+i*34,765,2,'#78ff96');
        if(game.messageTimer>0){ctx.textAlign='center';ctx.fillStyle='#ffdf75';ctx.font='22px "Share Tech Mono", monospace';ctx.fillText(game.message,W/2,102);ctx.textAlign='left';}
    }

    function drawSprite(pattern,x,y,scale,color,flip=0) {
        ctx.fillStyle=color;
        pattern.forEach((row,ry)=>[...row].forEach((bit,rx)=>{if(bit==='1'){
            let yy=ry;
            if(flip && (rx===0||rx===row.length-1) && ry>4) yy=Math.max(0,ry-1);
            ctx.fillRect(Math.round(x+rx*scale),Math.round(y+yy*scale),Math.ceil(scale),Math.ceil(scale));
        }}));
    }
    function overlay(title, sub) {
        ctx.fillStyle='rgba(1,5,4,.82)';ctx.fillRect(0,285,W,190);ctx.strokeStyle='#1e4c2c';ctx.strokeRect(30,300,W-60,160);
        ctx.textAlign='center';ctx.fillStyle='#ffdf75';ctx.font='bold 42px "Share Tech Mono", monospace';ctx.fillText(title,W/2,335);
        ctx.fillStyle='#91a998';ctx.font='16px "Share Tech Mono", monospace';ctx.fillText(sub,W/2,405);ctx.textAlign='left';
    }
    function pad(n){return String(n).padStart(6,'0');}

    function loop(now){ const dt=Math.min(.034,(now-last)/1000||0);last=now;update(dt);draw();frame=requestAnimationFrame(loop); }
    function unlockAudio(){ if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==='suspended')audio.resume(); }
    function beep(freq,duration,type='square',volume=.03){if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}

    function onKey(e,down){
        if(['ArrowLeft','ArrowRight','Space','KeyA','KeyD','KeyP','Enter'].includes(e.code))e.preventDefault();
        if(e.code==='ArrowLeft'||e.code==='KeyA')keys.left=down;
        if(e.code==='ArrowRight'||e.code==='KeyD')keys.right=down;
        if(e.code==='Space'){keys.fire=down;if(down&&game.state!=='playing')start();}
        if(down&&e.code==='Enter')start();
        if(down&&e.code==='KeyP'&&(game.state==='playing'||game.state==='paused'))game.state=game.state==='paused'?'playing':'paused';
    }
    const kd=e=>onKey(e,true), ku=e=>onKey(e,false), blur=()=>{keys.left=keys.right=keys.fire=false;};
    function bindHold(id,key){const el=document.getElementById(id);if(!el)return;const on=e=>{e.preventDefault();unlockAudio();keys[key]=true;el.classList.add('active');if(key==='fire'&&game.state!=='playing')start();};const off=e=>{e.preventDefault();keys[key]=false;el.classList.remove('active');};el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('pointerleave',off);}

    return {
        init(id){
            canvas=document.getElementById(id);if(!canvas)return;ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;resetGame();
            window.addEventListener('keydown',kd,{passive:false});window.addEventListener('keyup',ku,{passive:false});window.addEventListener('blur',blur);
            canvas.addEventListener('pointerdown',()=>{unlockAudio();if(game.state!=='playing')start();});
            bindHold('moveLeft','left');bindHold('moveRight','right');bindHold('fireButton','fire');
            last=performance.now();frame=requestAnimationFrame(loop);
        },
        dispose(){cancelAnimationFrame(frame);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',blur);if(audio){audio.close();audio=null;}canvas=null;ctx=null;}
    };
})();
