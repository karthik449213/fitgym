// Voice call frontend logic using Web Speech API (STT) and SpeechSynthesis (TTS)
(function(){
  const startBtn = document.getElementById('startCall');
  const callModal = document.getElementById('callModal');
  const micBtn = document.getElementById('micBtn');
  const micLabel = document.getElementById('micLabel');
  const hangupBtn = document.getElementById('hangupBtn');
  const hangupBtn2 = document.getElementById('hangupBtn2');
  const transcriptEl = document.getElementById('transcript');
  const messagesEl = document.getElementById('messages');
  const aiStatus = document.getElementById('aiStatus');
  const leadConfirm = document.getElementById('leadConfirm');

  let recognition = null;
  let listening = false;
  let sessionId = null;
  let messages = [];

  // Feature detection
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    startBtn.addEventListener('click', ()=> alert('Your browser does not support Web Speech API (SpeechRecognition). Use Chrome or Edge.'));
  }

  function openCall() {
    callModal.classList.remove('hidden');
    aiStatus.textContent = 'Waiting for input...';
    startRecognition();
  }

  function closeCall() {
    stopRecognition();
    callModal.classList.add('hidden');
    aiStatus.textContent = '';
    transcriptEl.textContent = '';
    messagesEl.innerHTML = '';
    leadConfirm.classList.add('hidden');
    // reset session
    sessionId = null;
    messages = [];
  }

  function startRecognition(){
    if (!SpeechRecognition) return;
    if (recognition) recognition.abort();
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add('on');
      micLabel.textContent = 'Listening';
      aiStatus.textContent = 'Listening...';
    };

    recognition.onerror = (e) => {
      console.error('SpeechRecognition error', e);
      aiStatus.textContent = 'Microphone error';
    };

    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove('on');
      micLabel.textContent = 'Paused';
      aiStatus.textContent = 'Paused';
    };

    let interim = '';
    recognition.onresult = (event) => {
      interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal) {
          transcriptEl.textContent = '';
          addMessage('user', text);
          sendToChat(text);
        } else {
          interim += text + ' ';
          transcriptEl.textContent = interim;
        }
      }
    };

    recognition.start();
  }

  function stopRecognition(){
    if (recognition) {
      try { recognition.stop(); } catch(e){}
      recognition = null;
    }
    listening = false;
    micBtn.classList.remove('on');
    micLabel.textContent = 'Paused';
  }

  function addMessage(role, text){
    const el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendToChat(userText){
    aiStatus.textContent = 'Processing...';
    // maintain conversation on client as well
    messages.push({ role: 'user', content: userText });
    try {
      const resp = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messages })
      });
      const data = await resp.json();
      if (data.sessionId) sessionId = data.sessionId;
      const aiReply = data.aiReply || '';
      messages.push({ role: 'assistant', content: aiReply });
      addMessage('ai', aiReply);
      aiStatus.textContent = 'AI speaking...';
      speakText(aiReply);

      // Frontend detection and forwarding of LEAD_DATA
      if (/LEAD_DATA:/i.test(aiReply)) {
        const lead = parseLead(aiReply);
        if (lead) {
          try {
            await fetch('/n8n', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lead) });
            showLeadConfirm(lead);
          } catch (err) {
            console.error('Failed to forward lead to n8n proxy', err);
          }
        }
      }

      aiStatus.textContent = 'Ready';
    } catch (err) {
      console.error('Chat error', err);
      aiStatus.textContent = 'Error';
    }
  }

  function parseLead(text){
    const match = text.match(/LEAD_DATA:\s*([\s\S]*)/i);
    if (!match) return null;
    const body = match[1];
    const name = (body.match(/Name:\s*(.*)/i)||[])[1]||'';
    const contact = (body.match(/Contact:\s*(.*)/i)||[])[1]||'';
    const goal = (body.match(/Goal:\s*(.*)/i)||[])[1]||'';
    const intent = (body.match(/Intent:\s*(.*)/i)||[])[1]||'';
    const time = (body.match(/Time:\s*(.*)/i)||[])[1]||'';
    if (!name && !contact && !goal && !intent && !time) return null;
    return { name: name.trim(), contact: contact.trim(), goal: goal.trim(), intent: intent.trim(), time: time.trim() };
  }

  function showLeadConfirm(lead){
    leadConfirm.classList.remove('hidden');
    leadConfirm.innerHTML = `<strong>Lead sent:</strong><div>Name: ${escapeHtml(lead.name)}</div><div>Contact: ${escapeHtml(lead.contact)}</div><div>Goal: ${escapeHtml(lead.goal)}</div><div>Intent: ${escapeHtml(lead.intent)}</div><div>Time: ${escapeHtml(lead.time)}</div>`;
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]); }

  function speakText(text){
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 1.0;
    utter.onend = ()=> {
      aiStatus.textContent = 'Ready';
      // resume listening after speaking
      if (!listening) startRecognition();
    };
    utter.onerror = (e)=> { console.error('TTS error', e); aiStatus.textContent = 'TTS error'; };
    // Stop recognition while speaking to avoid feedback
    stopRecognition();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  // UI bindings
  startBtn.addEventListener('click', openCall);
  micBtn.addEventListener('click', ()=>{
    if (listening) stopRecognition(); else startRecognition();
  });
  hangupBtn.addEventListener('click', closeCall);
  hangupBtn2.addEventListener('click', closeCall);

})();
