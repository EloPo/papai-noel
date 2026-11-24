{
  // ================= AJUSTES =================
  const FONE_DE_OUVIDO = true;        // true: a voz sai no fone (ele pode ouvir enquanto fala) · false: caixa de som
  const SILENCIO_PARA_ENCERRAR_S = 15; // sem resposta por esse tempo, ele pergunta se a pessoa ainda está lá
  const CONVITE_QUANDO_ALGUEM_CHEGA = true; // mostra "Diga Papai Noel!" (sem som) quando alguém aparece na câmera
  const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
  const MODELO_ROSTO = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  // ===========================================

  const $ = s => document.querySelector(s);
  const pick = a => a[Math.floor(Math.random()*a.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const body = document.body, bubble = $('#bubble'), text = $('#text'), rest = $('#rest'), jaw = $('#jaw');
  const irisL = $('#irisL'), irisR = $('#irisR'), turn = $('#turn');
  const lids = [...document.querySelectorAll('.lid')].map(r => ({r, l:r.nextElementSibling, top:+r.getAttribute('y')}));
  const listen = $('#listen'), listenText = $('#listenText'), heard = $('#heard'), statusEl = $('#status');

  let camState = '…', micState = '…', statusTimer;
  function showStatus(err){
    statusEl.textContent = err || `Câmera: ${camState} · Microfone: ${micState} · Voz: ${voiceName}`;
    statusEl.classList.toggle('err', !!err); statusEl.classList.remove('fade');
    clearTimeout(statusTimer); if (!err) statusTimer = setTimeout(() => statusEl.classList.add('fade'), 12000);
  }

  // ---------- voz do Papai Noel (sempre masculina) ----------
  const synth = window.speechSynthesis;
  const MASC = /Antonio|Donato|Fabio|Humberto|Julio|Nicolau|Valerio|Daniel|Felipe|Ricardo|Heitor|Andrew|Brian|Guy|Christopher|Eric|Roger|Steffan|Davis|Tony|Jason|Male|Masculin/i;
  const FEM = /Francisca|Thalita|Brenda|Elza|Giovanna|Leila|Leticia|Manuela|Yara|Maria|Luciana|Joana|Fernanda|Raquel|Vitoria|Female|Feminin|Google portugu/i;
  let voice = null, voiceName = 'procurando', natural = false, maleVoice = false;
  function chooseVoice(){
    try {
      const all = synth.getVoices();
      const pt = all.filter(x => /^pt[-_]?BR/i.test(x.lang) || /portugu.*bra/i.test(x.name));
      const male = pt.filter(x => MASC.test(x.name) && !FEM.test(x.name));
      const order = [/Antonio.*Natural/i, /Natural/i, /Online/i, /./];
      let found = null;
      for (const re of order){ found = male.find(x => re.test(x.name)); if (found) break; }
      // vozes "multilíngues" masculinas do Edge também falam português
      if (!found) found = all.find(x => /Multilingual/i.test(x.name) && MASC.test(x.name) && /Natural/i.test(x.name));
      maleVoice = !!found;
      if (!found) found = pt.find(x => !FEM.test(x.name)) || pt[0] || null;
      voice = found;
      if (voice){ voiceName = voice.name.replace(/Microsoft |Online |\(Natural\)| - .*$/g,'').trim(); natural = /Natural|Online/i.test(voice.name); }
      if (all.length){
        if (!maleVoice) showStatus('Voz masculina não encontrada neste navegador. Use o Microsoft Edge (voz “Antonio”) com internet.');
        else showStatus();
      }
    } catch(e){}
  }
  if (synth){ chooseVoice(); try { synth.addEventListener('voiceschanged', chooseVoice); } catch(e){} setTimeout(chooseVoice, 1500); }

  const keep = [];   // guarda as falas para o navegador não descartá-las no meio (isso cortava a frase)
  function speak(s){
    return new Promise(res => {
      if (!synth) return res();
      let done = false, keepAlive;
      const fin = () => { if (!done){ done = true; clearInterval(keepAlive); res(); } };
      try {
        const u = new SpeechSynthesisUtterance(s.replace(/Ho ho ho/gi,'Rô, rô, rô'));
        u.lang = 'pt-BR'; if (voice) u.voice = voice;
        // voz natural masculina já é grave; nas outras abaixamos o tom
        u.pitch = natural ? .9 : (maleVoice ? .75 : .45); u.rate = natural ? .95 : .9;
        u.onend = fin; u.onerror = fin;
        keep.push(u); if (keep.length > 20) keep.shift();
        if (synth.paused) synth.resume();
        synth.speak(u);
        keepAlive = setInterval(() => { if (synth.speaking && !synth.paused){ synth.pause(); synth.resume(); } }, 10000);
      } catch(e){ fin(); }
      setTimeout(fin, s.length*160 + 6000);   // só se o navegador não avisar o fim
    });
  }

  // ---------- falas na tela ----------
  let mode = 'idle', busy = false, queue = [], lastSpokeEnd = 0;
  function setListen(){
    listen.className = 'listen ' + (busy ? 'talking' : conv ? 'hearing' : 'idle');
    listenText.textContent = busy ? 'Papai Noel está falando…' : conv ? 'Pode falar, estou ouvindo!' : 'Diga “Papai Noel!” para conversar';
  }
  // o balão sempre cabe na tela: ao lado do rosto se houver espaço, senão em cima
  const faceSvg = document.querySelector('.santa svg');
  function placeBubble(){
    const r = faceSvg.getBoundingClientRect(), W = innerWidth, H = innerHeight, m = 16;
    const x = r.left + r.width*.84, space = W - x - m;
    if (space >= Math.min(300, W*.24)){
      bubble.className = bubble.className.replace(/\b(side|top)\b/g,'').trim() + ' side';
      bubble.style.left = x + 'px'; bubble.style.top = (r.top + r.height*.2) + 'px';
      bubble.style.maxWidth = Math.min(space, 600) + 'px'; bubble.style.translate = '0 0';
    } else {
      bubble.className = bubble.className.replace(/\b(side|top)\b/g,'').trim() + ' top';
      bubble.style.left = (W/2) + 'px'; bubble.style.maxWidth = (W - 2*m) + 'px'; bubble.style.translate = '-50% 0';
      bubble.style.top = Math.max(m, r.top + r.height*.06 - bubble.offsetHeight - 34) + 'px';
    }
  }
  addEventListener('resize', placeBubble);
  function showBubble(){ placeBubble(); bubble.classList.add('show'); }

  async function line(s){
    const ho = /^ho ho ho!?$/i.test(s.trim());
    bubble.classList.remove('invite'); bubble.classList.toggle('ho', ho);
    text.textContent = ''; rest.textContent = s;
    showBubble();
    mode = ho ? 'laugh' : 'talk'; body.classList.toggle('laugh', /^ho ho ho/i.test(s));
    (window.__said ||= []).push(s); if (window.__said.length > 80) window.__said.shift();
    const voiceDone = speak(s);
    for (let i=1;i<=s.length;i++){ text.textContent = s.slice(0,i); rest.textContent = s.slice(i); await wait(ho ? 100 : 45); }
    await voiceDone;
    mode = 'idle'; body.classList.remove('laugh');
    await wait(250);
  }
  async function run(){
    if (busy) return; busy = true; setListen();
    while (queue.length){ const ls = queue.shift(); for (const l of ls) await line(l); }
    busy = false; lastSpokeEnd = performance.now();
    if (conv) conv.last = Date.now();          // o tempo de resposta começa agora
    else setTimeout(() => { if (!busy && !conv) bubble.classList.remove('show'); }, 3000);
    setListen();
  }
  function say(lines){ queue.push(lines.filter(Boolean)); run(); }
  function invite(){
    if (busy || conv) return;
    bubble.classList.remove('ho'); bubble.classList.add('invite');
    text.textContent = 'Diga “Papai Noel!”'; rest.textContent = '';
    showBubble();
    setTimeout(() => { if (!busy && !conv) bubble.classList.remove('show'); }, 6000);
  }

  // ---------- entender o que a pessoa disse ----------
  // fold mantém o mesmo tamanho do texto original, para recortar o pedido com acentos
  const fold = s => s.toLowerCase().normalize('NFC').split('').map(ch => ch.normalize('NFD').replace(/[̀-ͯ]/g,'')[0] || ' ').join('').replace(/[^a-z0-9]/g,' ');
  const clean = s => s.replace(/\s+/g,' ').trim();
  const WAKE = /\b(papai|papa)\s*(noel|noe|no el|noeu|nuel)\b/;
  const PROIBIDAS = /\b(porra|caralh|merda|puta|bost|foda|fod[ae]|viad|buceta|cacete|arromb|desgra|piranha|otari|idiot|burr[oa])\w*/;
  const YES = /\b(sim|claro|comportei|me comportei|uhum|aham|com certeza|acho que sim|fui sim|bastante|muito bem|demais|obvio)\b/;
  const MEH = /\b(mais ou menos|um pouco|um pouquinho|nem sempre|as vezes|nem tanto|quase|acho que nao sei|meio)\b/;
  const NO = /\b(nao|nem|nunca)\b/;

  function cut(raw, f, re){ // aplica a regex no texto sem acentos e devolve o trecho com acentos
    const m = re.exec(f); if (!m) return null;
    const g = m[m.length-1]; if (!g) return null;
    const start = m.index + m[0].lastIndexOf(g);
    return clean(raw.slice(start, start + g.length));
  }
  function tidyWish(w){
    if (!w) return null;
    w = w.replace(/[.!?]+$/,'').replace(/\b(de presente|por favor|papai noel|pro natal|para o natal|de natal|nesse natal|neste natal|esse ano|este ano)\b/gi,'');
    w = clean(w.replace(/[,\s]+(tamb[eé]m|tb|tbm)$/i,'').replace(/^(tamb[eé]m)\s+/i,''));
    if (/\b(pedido|pedir|fazer|outro|outra)\b/.test(fold(w)) && w.split(' ').length <= 4) return null;
    if (w.length > 50) w = w.slice(0,50).replace(/\s+\S*$/,'');
    return w.length >= 2 ? w : null;
  }
  function wishFrom(raw){
    const f = fold(raw);
    const re = /(?:quero|queria|gostaria de|vou querer|peco|pedir|meu pedido e|pedido e|eu quero ganhar|ganhar)(?:\s+de)?(?:\s+ganhar)?(?:\s+de presente)?\s+(.+)$/;
    return tidyWish(cut(raw, f, re));
  }
  function willGet(raw){ // "será que eu vou ganhar ..."
    const f = fold(raw);
    return tidyWish(cut(raw, f, /(?:vou|vai|irei|eu vou)\s+(?:ganhar|receber)\s+(.+)$/)) || tidyWish(cut(raw, f, /(?:voce|vc)\s+(?:vai|pode)\s+(?:me\s+)?(?:dar|trazer)\s+(.+)$/));
  }
  function nameFrom(raw){
    const f = fold(raw);
    const n = cut(raw, f, /(?:meu nome e|me chamo|eu sou o|eu sou a|pode me chamar de)\s+([a-z]+)/);
    return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : null;
  }
  const cap = s => s[0].toUpperCase() + s.slice(1);
  function daysToXmas(){
    const n = new Date(), today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    let x = new Date(n.getFullYear(), 11, 25); if (today > x) x = new Date(n.getFullYear()+1, 11, 25);
    return Math.round((x - today)/864e5);
  }

  // perguntas soltas que ele sabe responder em qualquer momento da conversa
  function smallTalk(f){
    if (/quantos dias|quanto falta|falta quanto|falta muito|quando e o natal|quando chega o natal/.test(f)){
      const d = daysToXmas();
      return d === 0 ? ['É hoje! Feliz Natal!'] : d === 1 ? ['É amanhã! Já estou arrumando o trenó!'] : [`Faltam ${d} dias para o Natal!`, 'Estou contando os dias também!'];
    }
    if (/\bcomo (voce )?(esta|vai)\b|\btudo bem com voce\b|^e voce\b/.test(f)) return ['Estou ótimo! Muito ocupado preparando os presentes!'];
    if (/\brenas?\b/.test(f)) return ['Minhas renas estão descansando para a grande noite!'];
    if (/onde (voce )?mora|polo norte|sua casa/.test(f)) return ['Eu moro no Polo Norte, com a Mamãe Noel, os duendes e as renas!'];
    if (/quantos anos|sua idade/.test(f)) return ['Ho ho ho!', 'Já perdi a conta... sou mais velho que as estrelas!'];
    if (/duende/.test(f)) return ['Meus duendes estão trabalhando muito na fábrica de brinquedos!'];
    if (/mamae noel|sua esposa|sua mulher/.test(f)) return ['A Mamãe Noel está fazendo biscoitos para a viagem!'];
    if (/existe|de verdade|voce e real/.test(f)) return ['Ho ho ho!', 'Enquanto existir magia no seu coração, eu vou existir!'];
    if (/chamine|como voce entra/.test(f)) return ['Ho ho ho! Isso é segredo de Papai Noel... um pouquinho de magia!'];
    if (/treno|voar|voa/.test(f)) return ['Meu trenó voa com a magia das renas e a alegria das crianças!'];
    if (/biscoito|leite|comer|comida|gosta de comer/.test(f)) return ['Adoro biscoitos com leite! Pode deixar alguns pra mim na noite de Natal!'];
    if (/frio|neve/.test(f)) return ['No Polo Norte faz muito frio, mas minha barba me esquenta!'];
    if (/cartinha|carta/.test(f)) return ['Eu leio todas as cartinhas, uma por uma!'];
    if (/feliz natal/.test(f)) return ['Ho ho ho!', 'Feliz Natal pra você também!'];
    if (/\b(te amo|gosto de voce|amo voce)\b/.test(f)) return ['Ho ho ho!', 'Eu também gosto muito de você!'];
    if (/\b(ho ho|ro ro|rou rou)\b/.test(f)) return ['Ho ho ho!'];
    if (/qual (e )?(o )?seu nome|como voce se chama/.test(f)) return ['Eu sou o Papai Noel, ora! Ho ho ho!', 'E você, como se chama?'];
    return null;
  }

  // ---------- conversa ----------
  let conv = null;     // {state, wishes, name, behaved, last, checked}
  let memory = null;   // a conversa que acabou de terminar, para a criança poder voltar
  const nm = () => conv?.name || 'amiguinho';
  const joinPt = a => a.length <= 1 ? (a[0] || '') : a.slice(0,-1).join(', ') + ' e ' + a[a.length-1];
  const ASK_WISH = () => `E qual é o seu pedido para esse Natal, ${nm()}?`;
  const END_WORDS = /^(nao|nada|so isso|e so|e so isso|so|tchau|ate logo|ate mais|obrigad\w*|valeu|acabou|ja chega|nao obrigad\w*|nao quero)\b|\b(tchau|so isso|e so isso)\b/;
  const MORE_WISH = /\b(outro pedido|mais um pedido|mais pedido|mais uma coisa pra pedir|quero pedir mais|esqueci|pedir de novo|fazer outro|fazer mais um)\b/;
  const CHANGE_WISH = /\b(mudar|trocar) (o |de |meu |o meu )*pedido\b/;

  function startConv(from){
    conv = {state:'wish', wishes:[], name:null, behaved:null, last:Date.now(), checked:false, ...(from || {})};
    memory = null; setListen();
  }
  function endConv(lines){
    if (conv) memory = {wishes:conv.wishes, name:conv.name, behaved:conv.behaved, endedAt:Date.now(), presentSince:presentSince};
    conv = null; setListen();
    if (lines) say(lines);
  }
  function goodbye(extra){
    endConv([extra, `Feliz Natal, ${nm()}! Ho ho ho!`, 'Se quiser voltar, é só me chamar!']);
  }
  function addWish(w, intro){
    conv.wishes.push(w); conv.state = 'more';
    say([...(intro || []), `${cap(w)}! Que pedido especial!`, 'Vou anotar na minha lista.', 'Quer pedir mais alguma coisa?']);
  }
  function askBehaved(pre){
    conv.state = 'behaved';
    say([...(pre || []), 'Me conta: você se comportou bem este ano?']);
  }
  function afterWishes(){ // terminou de pedir
    if (conv.behaved === null) askBehaved([conv.wishes.length > 1 ? 'Quantos pedidos! Ho ho ho!' : null]);
    else { conv.state = 'open'; say([`Anotei tudo: ${joinPt(conv.wishes)}!`, 'Quer me contar mais alguma coisa?']); }
  }
  function willGetReply(g){
    if (!conv.wishes.includes(g)) conv.wishes.push(g);
    if (conv.behaved === null) askBehaved([`${cap(g)}? Hmm... deixa eu ver minha lista...`]);
    else { conv.state = 'open'; say([`${cap(g)}? Hmm... deixa eu ver minha lista...`, conv.behaved === 'yes' ? 'Você está na lista dos bonzinhos, então vou caprichar!' : 'Se você se comportar até o Natal, vou caprichar!', 'Mais alguma coisa?']); }
  }

  function handle(raw){
    const f = clean(fold(raw));
    if (!f) return;
    const wake = WAKE.test(f);
    const restTxt = clean(f.replace(WAKE,''));
    const now = Date.now();

    // voltar logo depois da despedida (a mesma pessoa ainda está na frente)
    const samePerson = memory && now - memory.endedAt < 90000 && (faceMode ? (present && presentSince === memory.presentSince) : now - memory.endedAt < 60000);
    const wantsBack = /\b(espera|volta|voltei|esqueci|peraí|perai|ei|mais um pedido|outro pedido|quero pedir|mais uma coisa)\b/.test(f);
    if (!conv && samePerson && (wake || wantsBack)){
      showHeard(raw);
      startConv({wishes:memory.wishes, name:memory.name, behaved:memory.behaved, state:'open'});
      const w = wishFrom(raw);
      if (w){ addWish(w, ['Ho ho ho! Voltei!']); return; }
      if (MORE_WISH.test(f) || /\bpedir\b/.test(f)){ conv.state = 'wish'; say([`Ho ho ho! Voltei, ${nm()}!`, 'Pode falar, qual é o outro pedido?']); return; }
      say([`Ho ho ho! Voltei, ${nm()}!`, 'Quer fazer mais um pedido ou me contar alguma coisa?']);
      return;
    }

    if (!conv && !wake) return;                 // sem "Papai Noel", ele não puxa conversa
    showHeard(raw);
    if (PROIBIDAS.test(f)){ say(['Ho ho ho! Vamos manter o espírito de Natal, combinado?']); return; }

    if (!conv){
      startConv();
      const g = willGet(raw), w = wishFrom(raw), st = smallTalk(restTxt);
      if (g){ say(['Ho ho ho! Olá, amiguinho!']); willGetReply(g); return; }
      if (w){ addWish(w, ['Ho ho ho! Olá, amiguinho!']); return; }
      if (st){ say(['Ho ho ho! Olá, amiguinho!', ...st, 'E qual é o seu pedido para esse Natal?']); return; }
      say(['Ho ho ho!', 'Olá, amiguinho! Como você está?', 'Qual o seu pedido para esse Natal?']);
      return;
    }

    conv.last = now; conv.checked = false;
    if (wake && restTxt.length < 3){ say(['Estou aqui! Pode falar!']); return; }

    // nome
    let name = nameFrom(raw);
    if (!name && conv.state === 'name' && restTxt.split(' ').length <= 3){
      const w = restTxt.split(' ').find(x => !/^(eu|meu|nome|e|sou|o|a|me|chamo)$/.test(x));
      if (w && w.length > 1) name = w[0].toUpperCase() + w.slice(1);
    }
    if (name) conv.name = name;
    if (conv.state === 'name' || (name && !['behaved','more'].includes(conv.state))){
      conv.state = conv.wishes.length ? 'open' : 'wish';
      say([name ? `Que nome lindo, ${name}!` : 'Que nome lindo!', conv.wishes.length ? 'Quer me contar mais alguma coisa?' : ASK_WISH()]);
      return;
    }

    // trocar o pedido
    if (CHANGE_WISH.test(restTxt)){
      const w = wishFrom(raw.replace(/\b(mudar|trocar)\b.*?\bpedido\b/i,''));
      if (conv.wishes.length) conv.wishes.pop();
      if (w){ addWish(w, ['Tudo bem, vou trocar!']); }
      else { conv.state = 'wish'; say(['Tudo bem! Qual é o novo pedido?']); }
      return;
    }

    const g = willGet(raw);

    if (conv.state === 'wish'){
      if (g){ willGetReply(g); return; }
      const st = smallTalk(restTxt);
      if (st){ if (/se chama$/.test(clean(fold(st.join(' '))))) { conv.state = 'name'; say(st); } else say([...st, ASK_WISH()]); return; }
      const words = restTxt.split(' ').length;
      const w = wishFrom(raw);
      if (!w && conv.wishes.length && END_WORDS.test(restTxt)){ afterWishes(); return; }
      if (!w && /\b(mal|triste|doente|cansad|chatead)\w*/.test(restTxt) && words <= 6){ say(['Ah, que pena! Vai aqui um abraço bem quentinho do Papai Noel!', ASK_WISH()]); return; }
      if (!w && /\b(bem|otimo|otima|feliz|legal|beleza|tudo bem|bom|boa)\b/.test(restTxt) && words <= 5){ say(['Que bom, amiguinho!', ASK_WISH()]); return; }
      if (!w && /\b(nao sei|sei la)\b/.test(restTxt)){ say(['Ho ho ho! Pense com calma...', 'Pode ser um brinquedo, um livro, uma surpresa... o que você mais quer?']); return; }
      const wish = w || tidyWish(raw.replace(/papai\s*no[eé]l/ig,''));
      if (!wish){ say(['Não ouvi direito, amiguinho.', ASK_WISH()]); return; }
      addWish(wish, conv.wishes.length ? ['Ho ho ho!'] : ['Ho ho ho!']);
      return;
    }

    if (conv.state === 'more'){   // "Quer pedir mais alguma coisa?"
      if (g){ willGetReply(g); return; }
      const w = wishFrom(raw);
      if (w){ addWish(w, ['Ho ho ho! Mais um!']); return; }
      if (/^(sim|quero|tenho|uhum|aham|claro|isso|quero sim|tem)$/.test(restTxt) || MORE_WISH.test(restTxt)){ conv.state = 'wish'; say(['Pode falar! Qual é o próximo pedido?']); return; }
      if (END_WORDS.test(restTxt) || /^(nao|acho que nao|nao quero)/.test(restTxt)){ afterWishes(); return; }
      const st = smallTalk(restTxt);
      if (st){ say([...st, 'Quer pedir mais alguma coisa?']); return; }
      if (restTxt.split(' ').length <= 6){ const wish = tidyWish(raw.replace(/papai\s*no[eé]l/ig,'')); if (wish){ addWish(wish, ['Ho ho ho! Mais um!']); return; } }
      say(['Não entendi direito.', 'Quer pedir mais alguma coisa? Pode dizer sim ou não.']);
      return;
    }

    if (conv.state === 'behaved'){
      conv.state = 'open';
      const list = conv.wishes.length ? `Vou fazer o possível para trazer ${joinPt(conv.wishes)}!` : null;
      if (MEH.test(restTxt)){ conv.behaved = 'meh'; say(['Ho ho ho! Então vamos caprichar até o Natal, combinado?', list, 'Quer me contar mais alguma coisa?']); }
      else if (YES.test(restTxt) && !/\bnao\b/.test(restTxt)){ conv.behaved = 'yes'; say(['Muito bem! Seu nome está na lista dos bonzinhos!', list, 'Quer me contar mais alguma coisa?']); }
      else if (NO.test(restTxt)){ conv.behaved = 'no'; say(['Ho ho ho! Ainda dá tempo!', 'Obedeça a mamãe e o papai e seja gentil com todo mundo, combinado?', 'Quer me contar mais alguma coisa?']); }
      else { conv.behaved = 'yes'; say(['Ho ho ho! Tenho certeza de que você foi uma criança muito boa!', list, 'Quer me contar mais alguma coisa?']); }
      return;
    }

    // conversa livre
    if (MORE_WISH.test(restTxt) || /^(quero pedir|posso pedir)/.test(restTxt)){
      const w = wishFrom(raw);
      if (w && !/^(mais|outro|outra)\b/i.test(w)){ addWish(w, ['Ho ho ho! Mais um!']); }
      else { conv.state = 'wish'; say(['Claro! Pode falar, qual é o outro pedido?']); }
      return;
    }
    if (g){ willGetReply(g); return; }
    const w = wishFrom(raw);
    if (w){ addWish(w, ['Ho ho ho! Mais um!']); return; }
    if (END_WORDS.test(restTxt)){ goodbye(/obrigad|valeu/.test(restTxt) ? 'De nada!' : 'Então tá bom!'); return; }
    if (/^(sim|quero|tenho|uhum|aham|claro)$/.test(restTxt)){ say(['Pode falar, estou ouvindo!']); return; }
    if (/\b(meus pedidos|minha lista|o que eu pedi|qual (foi )?meu pedido)\b/.test(restTxt)){
      say([conv.wishes.length ? `Na sua lista tem: ${joinPt(conv.wishes)}!` : 'Você ainda não fez nenhum pedido!', 'Mais alguma coisa?']); return;
    }
    const st = smallTalk(restTxt);
    if (st){ if (/se chama$/.test(clean(fold(st.join(' '))))) { conv.state = 'name'; say(st); } else say([...st, 'Mais alguma coisa?']); return; }
    say([pick(['Ho ho ho! Que legal!', 'Que interessante!', 'Ho ho ho! Você é muito esperto!', 'Hmm, que bacana!']), 'Mais alguma coisa?']);
  }

  // silêncio: pergunta se ainda está lá, depois se despede
  setInterval(() => {
    if (!conv || busy) return;
    if (Date.now() - conv.last > SILENCIO_PARA_ENCERRAR_S*1000){
      if (!conv.checked){ conv.checked = true; say([`Você ainda está aí, ${nm()}?`]); }
      else goodbye('Tchau!');
    }
  }, 1000);

  let heardTimer;
  function showHeard(s){
    heard.textContent = `Ouvi: “${s}”`; heard.classList.add('show');
    clearTimeout(heardTimer); heardTimer = setTimeout(() => heard.classList.remove('show'), 5000);
  }

  // ---------- reconhecimento de voz ----------
  // O microfone fica aberto o tempo todo: assim o navegador não pede permissão de novo
  // e o fone não fica trocando de modo (o que cortava o som da voz).
  let micStream = null;
  function startRecognition(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){ micState = 'sem reconhecimento de fala'; showStatus('Este navegador não reconhece fala. Use o Microsoft Edge.'); return; }
    let stopped = false, rec = null, startedAt = 0, quickEnds = 0;
    const begin = () => {
      rec = new SR(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++){
          const r = e.results[i], s = r[0].transcript.trim();
          if (!s) continue;
          const ignore = busy || performance.now() - lastSpokeEnd < (FONE_DE_OUVIDO ? 300 : 1500);
          if (!r.isFinal){ if (!ignore && (conv || WAKE.test(clean(fold(s))))) { heard.textContent = `Ouvindo: “${s}”`; heard.classList.add('show'); } continue; }
          if (!ignore) handle(s);
        }
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed'){ stopped = true; micState = 'bloqueado'; showStatus('O microfone foi bloqueado. Libere o microfone para este site (veja as instruções).'); }
        else if (e.error === 'network'){ micState = 'sem internet'; showStatus('O reconhecimento de fala precisa de internet.'); }
        else if (e.error === 'audio-capture'){ micState = 'sem microfone'; showStatus('Microfone não encontrado. Confira o fone.'); }
      };
      rec.onend = () => {
        if (stopped) return;
        quickEnds = performance.now() - startedAt < 1500 ? quickEnds + 1 : 0;   // se cair rápido várias vezes, espera mais
        setTimeout(() => { try { begin(); } catch(e){} }, Math.min(300 * 2**quickEnds, 5000));
      };
      try { startedAt = performance.now(); rec.start(); if (micState !== 'ouvindo'){ micState = 'ouvindo'; showStatus(); } } catch(e){}
    };
    begin();
  }

  // ---------- câmera: quem está na frente ----------
  let gaze = {x:0,y:0}, gazeT = {x:0,y:0}, nextWander = 0, tracking = false;
  const lookAt = (nx, ny) => { gazeT = {x:Math.max(-1,Math.min(1,nx)), y:Math.max(-1,Math.min(1,ny))}; };
  const video = document.createElement('video'); video.muted = true; video.playsInline = true;
  let present = false, lastSeen = 0, presentSince = 0, lastInvite = -1e9;
  function presence(found, nx, ny){
    const now = performance.now();
    if (found){
      lastSeen = now; tracking = true; lookAt(nx, ny);
      if (!present){ present = true; presentSince = now; }
      if (CONVITE_QUANDO_ALGUEM_CHEGA && now - presentSince > 1500 && now - lastInvite > 30000){ lastInvite = now; invite(); }
    } else if (present && now - lastSeen > 2500){
      present = false; tracking = false;
      if (conv && !busy && now - lastSeen > 2500) setTimeout(() => { if (!present && conv && !busy) endConv(['Tchau, amiguinho! Feliz Natal!']); }, 6000);
    }
  }
  async function startFaceDetector(){
    const vision = await import(MEDIAPIPE + '/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE + '/wasm');
    const make = delegate => vision.FaceDetector.createFromOptions(files, {baseOptions:{modelAssetPath:MODELO_ROSTO, delegate}, runningMode:'VIDEO', minDetectionConfidence:.55});
    let det; try { det = await make('GPU'); } catch(e){ det = await make('CPU'); }
    camState = 'vendo rostos'; faceMode = true; showStatus();
    let lastT = -1;
    const tick = () => {
      if (video.readyState >= 2 && video.currentTime !== lastT){
        lastT = video.currentTime;
        try {
          const d = det.detectForVideo(video, performance.now()).detections || [];
          if (d.length){
            const b = d.reduce((a,c) => c.boundingBox.width > a.boundingBox.width ? c : a).boundingBox;
            presence(true, -((b.originX + b.width/2)/video.videoWidth - .5)*2.4, ((b.originY + b.height/2)/video.videoHeight - .5)*2.2);
          } else presence(false);
        } catch(e){}
      }
      setTimeout(tick, 120);
    };
    tick();
  }
  function startMotionDetector(){
    const c = document.createElement('canvas'); c.width = 64; c.height = 48;
    const g = c.getContext('2d', {willReadFrequently:true});
    let prev = null, calm = 0;
    camState = 'detectando movimento'; showStatus();
    const tick = () => {
      if (video.readyState >= 2){
        g.drawImage(video, 0, 0, 64, 48);
        const px = g.getImageData(0,0,64,48).data, cur = new Uint8Array(64*48);
        let n = 0, sx = 0, sy = 0;
        for (let i=0;i<cur.length;i++){
          cur[i] = (px[i*4]*.3 + px[i*4+1]*.59 + px[i*4+2]*.11)|0;
          if (prev && Math.abs(cur[i]-prev[i]) > 28){ n++; sx += i%64; sy += (i/64)|0; }
        }
        prev = cur;
        if (n/cur.length > .015){ calm = 0; presence(true, -((sx/n)/64-.5)*2.4, ((sy/n)/48-.5)*2.2); }
        else if (++calm > 25) presence(false);
      }
      setTimeout(tick, 120);
    };
    tick();
  }

  // ---------- iniciar sozinho (sem mouse nem teclado) ----------
  let faceMode = false;
  (async () => {
    setListen();
    try {
      const v = await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}});
      video.srcObject = v; try { await video.play(); } catch(e){}
      camState = 'carregando'; showStatus();
      startFaceDetector().catch(() => startMotionDetector());
    } catch(e){ camState = 'indisponível'; showStatus(); }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
      startRecognition();
    } catch(e){ micState = 'indisponível'; showStatus('Microfone indisponível. Confira o fone e a permissão do navegador.'); }
  })();

  // ---------- céu estrelado ----------
  const cv = $('#sky'), c = cv.getContext('2d');
  let W=0,H=0,stars=[],sparkles=[],meteor=null,nextMeteor=performance.now()+6000;
  function resize(){
    const d = Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
    cv.width=W*d; cv.height=H*d; c.setTransform(d,0,0,d,0,0);
    stars = Array.from({length:Math.round(W*H/2600)},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.3+.3,p:Math.random()*6.28,s:.4+Math.random()*1.6}));
    sparkles = Array.from({length:Math.max(8,Math.round(W*H/90000))},()=>({x:Math.random()*W,y:Math.random()*H,r:6+Math.random()*10,p:Math.random()*6.28,s:.5+Math.random(),g:Math.random()<.5}));
  }
  resize(); addEventListener('resize', resize);
  function sparkle(x,y,r,a,gold){
    c.globalAlpha = a; c.fillStyle = gold ? '#ffe7a3' : '#ffffff';
    c.beginPath(); c.moveTo(x,y-r); c.quadraticCurveTo(x,y,x+r*.35,y); c.quadraticCurveTo(x,y,x,y+r); c.quadraticCurveTo(x,y,x-r*.35,y); c.quadraticCurveTo(x,y,x,y-r); c.fill();
    c.beginPath(); c.moveTo(x-r*.7,y); c.quadraticCurveTo(x,y,x,y-r*.25); c.quadraticCurveTo(x,y,x+r*.7,y); c.quadraticCurveTo(x,y,x,y+r*.25); c.quadraticCurveTo(x,y,x-r*.7,y); c.fill();
    c.beginPath(); c.arc(x,y,r*.18,0,6.283); c.fill();
  }

  // ---------- loop de animação ----------
  let last = performance.now(), t = 0, open = 0, nextBlink = last + 2000, blinkAt = -1;
  function frame(now){
    const dt = Math.min((now-last)/1000,.05); last = now; t += dt;

    c.clearRect(0,0,W,H); c.fillStyle = '#fff';
    for (const s of stars){ c.globalAlpha = .3 + .7*Math.sin(t*s.s+s.p)**2; c.beginPath(); c.arc(s.x,s.y,s.r,0,6.283); c.fill(); }
    for (const s of sparkles){ const k = .5+.5*Math.sin(t*s.s+s.p); sparkle(s.x,s.y,s.r*(.6+.4*k),.35+.65*k,s.g); }
    if (!meteor && now > nextMeteor) meteor = {x:Math.random()*W*.6, y:Math.random()*H*.3, vx:W*.55, vy:H*.22, life:1};
    if (meteor){
      meteor.x += meteor.vx*dt; meteor.y += meteor.vy*dt; meteor.life -= dt*1.1;
      const g = c.createLinearGradient(meteor.x-120,meteor.y-48,meteor.x,meteor.y);
      g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(1,'rgba(255,255,255,'+Math.max(0,meteor.life)+')');
      c.globalAlpha = 1; c.strokeStyle = g; c.lineWidth = 2; c.beginPath(); c.moveTo(meteor.x-120,meteor.y-48); c.lineTo(meteor.x,meteor.y); c.stroke();
      if (meteor.life <= 0){ meteor = null; nextMeteor = now + 8000 + Math.random()*12000; }
    }
    c.globalAlpha = 1;

    // boca
    let target = 0;
    if (mode === 'laugh') target = .55 + .45*Math.abs(Math.sin(now/100));
    else if (mode === 'talk') target = .15 + .85*Math.abs(Math.sin(now/72)*Math.sin(now/181));
    open += (target-open)*Math.min(1,dt*18);
    jaw.setAttribute('transform', `translate(0 ${(open*18).toFixed(2)})`);

    // olhos: seguem a pessoa ou passeiam
    if (!tracking && now > nextWander){
      gazeT = Math.random() < .4 ? {x:0,y:0} : {x:Math.random()*1.6-.8, y:Math.random()*1.2-.6};
      nextWander = now + 1500 + Math.random()*3000;
    }
    gaze.x += (gazeT.x-gaze.x)*Math.min(1,dt*(tracking?6:4)); gaze.y += (gazeT.y-gaze.y)*Math.min(1,dt*(tracking?6:4));
    const ex = (gaze.x*11).toFixed(2), ey = (gaze.y*6).toFixed(2);
    irisL.setAttribute('transform', `translate(${ex} ${ey})`); irisR.setAttribute('transform', `translate(${ex} ${ey})`);
    turn.style.transform = tracking ? `rotate(${(gaze.x*-3.5).toFixed(2)}deg)` : '';

    // piscar
    if (now > nextBlink && blinkAt < 0) blinkAt = now;
    let lid = 0;
    if (blinkAt >= 0){
      const k = (now-blinkAt)/170; lid = k < .5 ? k*2 : 2-k*2;
      if (k >= 1){ blinkAt = -1; lid = 0; nextBlink = now + (Math.random()<.2 ? 200 : 2500 + Math.random()*3500); }
    }
    for (const o of lids){
      const h = lid*70; o.r.setAttribute('height', h.toFixed(1));
      o.l.setAttribute('y1', (o.top+h).toFixed(1)); o.l.setAttribute('y2', (o.top+h).toFixed(1)); o.l.setAttribute('opacity', lid > .05 ? 1 : 0);
    }


    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const lock = async () => { try { await navigator.wakeLock?.request('screen'); } catch(e){} };
  lock(); document.addEventListener('visibilitychange', () => { if (!document.hidden) lock(); });

  // teste sem microfone, pelo console: papaiNoelTeste('papai noel')
  window.papaiNoelTeste = s => { handle(s); return conv && conv.state; };
}
