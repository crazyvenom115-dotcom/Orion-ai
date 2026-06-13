import React, { useState, useEffect, useRef } from "react";
import { 
  Radio, 
  Tv, 
  Cpu, 
  Database, 
  Wifi, 
  Battery, 
  Volume2, 
  VolumeX, 
  Send, 
  Mic, 
  MicOff, 
  MapPin, 
  CloudSun, 
  Terminal, 
  Power,
  RotateCcw,
  Sparkles,
  Info
} from "lucide-react";

// Types
interface LogEntry {
  sender: "user" | "assistant";
  text: string;
  time: string;
}

interface ContextTelemetry {
  location: string;
  weather: string;
  time: string;
  date: string;
}

export default function App() {
  // Layout States
  const [currentLang, setCurrentLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const [appStatus, setAppStatus] = useState<"idle" | "listening" | "processing" | "speaking" | "error">("idle");
  const [responseText, setResponseText] = useState<string>("Systems nominal. Orion core initialized. Waiting for raw audio uplink, Operator.");
  const [transcriptLog, setTranscriptLog] = useState<LogEntry[]>([
    { sender: "assistant", text: "Systems nominal. Awaiting your command, Operator.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [textInputValue, setTextInputValue] = useState<string>("");
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Time-based States
  const [formattedTime, setFormattedTime] = useState<string>("00:00:00");
  const [formattedDate, setFormattedDate] = useState<string>("--- -- ----");

  // Telemetry & Environment States
  const [metrics, setMetrics] = useState({ cpu: 42, ram: 58, net: 320, pwr: 87 });
  const [locationValue, setLocationValue] = useState<string>("DETECTING POSITION...");
  const [weatherValue, setWeatherValue] = useState<string>("SYNCING WEATHER...");

  // Speech Recognition & Ref trackers
  const recognitionRef = useRef<any>(null);
  const speechActiveRef = useRef<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Digital Clock & Calendar update logic
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setFormattedTime(`${hh}:${mm}:${ss}`);

      const options: Intl.DateTimeFormatOptions = { 
        weekday: 'short', 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      };
      setFormattedDate(now.toLocaleDateString('en-US', options).toUpperCase());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Metrics drift simulator (adds immersive telemetry)
  useEffect(() => {
    const randomDrift = (current: number, min: number, max: number, maxStep: number) => {
      const step = (Math.random() - 0.5) * maxStep;
      let next = current + step;
      if (next < min) next = min;
      if (next > max) next = max;
      return Math.round(next);
    };

    const interval = setInterval(() => {
      setMetrics(prev => ({
        cpu: randomDrift(prev.cpu, 15, 95, 8),
        ram: randomDrift(prev.ram, 30, 90, 3),
        net: randomDrift(prev.net, 50, 980, 50),
        pwr: randomDrift(prev.pwr, 80, 100, 1),
      }));
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  // 3. Geolocation & Weather (Uses free key-less geocoding + OpenMeteo)
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationValue("UNSUPPORTED");
      setWeatherValue("UNAVAILABLE");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Reverse Geocoding
        try {
          const geoRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const geoData = await geoRes.json();
          const city = geoData.city || geoData.locality || geoData.principalSubdivision || "UNKNOWN";
          const country = geoData.countryCode || "IN";
          setLocationValue(`${city.toUpperCase()}, ${country}`);
        } catch (err) {
          setLocationValue("NETWORK ERROR");
        }

        // Fetch Live Weather Temperature
        try {
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
          );
          const weatherData = await weatherRes.json();
          const temp = weatherData?.current_weather?.temperature;
          if (temp !== undefined) {
            setWeatherValue(`${temp}°C`);
          } else {
            setWeatherValue("NO DATA");
          }
        } catch (err) {
          setWeatherValue("OFFLINE");
        }
      },
      () => {
        setLocationValue("ACCESS DENIED");
        setWeatherValue("-- °C");
      }
    );
  }, []);

  // 4. Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const rec = new SpeechRecognitionAPI();
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.lang = currentLang;

      rec.onstart = () => {
        speechActiveRef.current = true;
        setAppStatus("listening");
      };

      rec.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript.trim();
        if (transcript) {
          handleIncomingTransmission(transcript);
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech Recognition Error", e);
        speechActiveRef.current = false;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setResponseText("Microphone permission blocked or locked in sandbox. Please type manual commands below!");
          setAppStatus("error");
        } else if (e.error === "no-speech") {
          setResponseText("No speech signal detected. Try talking closer to the microphone, Operator.");
          setAppStatus("idle");
        } else {
          setResponseText(`Signal feedback issue: ${e.error}`);
          setAppStatus("idle");
        }
      };

      rec.onend = () => {
        speechActiveRef.current = false;
        setAppStatus(prev => prev === "listening" ? "idle" : prev);
      };

      recognitionRef.current = rec;
    } else {
      console.warn("Web Speech API not supported in this browser profile.");
    }
  }, [currentLang]);

  // Handle auto-scroll in transcripts
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptLog]);

  // 5. Speech Synthesis voice selection and output
  const synthesizeSpeech = (text: string) => {
    if (isMuted || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel(); // Clears any ongoing voice loops
    
    // Clean string from markdown asterisks for smoother TTS
    const cleanText = text.replace(/[\*\_`#\-]/g, " ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = currentLang;
    utterance.rate = 1.0;
    utterance.pitch = 0.95; // Slightly deeper, custom masculine/robotic space style

    // Voice assignment
    const voices = window.speechSynthesis.getVoices();
    const voiceMatch = voices.find(v => v.lang.startsWith(currentLang.split('-')[0])) || 
                       voices.find(v => v.lang.includes("IN")) || 
                       voices[0];
                       
    if (voiceMatch) utterance.voice = voiceMatch;

    utterance.onstart = () => setAppStatus("speaking");
    utterance.onend = () => setAppStatus("idle");
    utterance.onerror = () => setAppStatus("idle");

    window.speechSynthesis.speak(utterance);
  };

  // 6. Main response router - Processes offline directives else sends request to our rich Gemini model
  const handleIncomingTransmission = async (inputStr: string) => {
    if (!inputStr.trim()) return;

    // Log user utterance locally
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: LogEntry = { sender: "user", text: inputStr, time: timestamp };
    setTranscriptLog(prev => [...prev, userMsg]);
    setAppStatus("processing");
    setResponseText("Accessing neural core... Analyzing query telemetry...");

    // Quick Command Brain (Rule-based optimizations for local triggers)
    const normalizedInput = inputStr.toLowerCase();
    const hasWord = (...words: string[]) => words.some(w => normalizedInput.includes(w));

    let offlineAnswer = "";
    if (hasWord("help", "command list", "direct", "manual", "kya kar sakte ho")) {
      offlineAnswer = "Operator, I can respond to any mathematical, scientific, or general knowledge queries. Ask about the weather, local time, CPU parameters, or seek advice on code. Telemetry links are fully active.";
    } else if (hasWord("system status", "diagnostics", "cpu", "load", "ram")) {
      offlineAnswer = `Core metrics verified. Microprocessing load is at ${metrics.cpu}%, RAM reserve allocation sits at ${metrics.ram}%, and the high-frequency networks are logging speeds up to ${metrics.net} Mb/s. Thermals status green.`;
    } else if (hasWord("reset log", "clear chat", "chat clear", "saf karo")) {
      setTranscriptLog([{ sender: "assistant", text: "Systems refreshed. Let's record fresh data streams, Operator.", time: timestamp }]);
      setResponseText("Log register cleared. Core standing by.");
      setAppStatus("idle");
      return;
    }

    if (offlineAnswer) {
      setTimeout(() => {
        setResponseText(offlineAnswer);
        setTranscriptLog(prev => [...prev, { sender: "assistant", text: offlineAnswer, time: timestamp }]);
        synthesizeSpeech(offlineAnswer);
      }, 500);
      return;
    }

    // Call Real-time Gemini API server-side
    try {
      const activeContext: ContextTelemetry = {
        location: locationValue,
        weather: weatherValue,
        time: formattedTime,
        date: formattedDate
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: inputStr,
          history: transcriptLog.slice(-10), // Keep a small, smart conversation context window
          context: activeContext
        })
      });

      const data = await response.json();
      if (data.reply) {
        setResponseText(data.reply);
        setTranscriptLog(prev => [...prev, { sender: "assistant", text: data.reply, time: timestamp }]);
        synthesizeSpeech(data.reply);
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error: any) {
      console.error("Transmission interruption:", error);
      const errReply = "Core processing interruption. Unable to pipe connection to the cloud backend. Please check local server terminal constraints and your GEMINI_API_KEY settings.";
      setResponseText(errReply);
      setTranscriptLog(prev => [...prev, { sender: "assistant", text: errReply, time: timestamp }]);
      setAppStatus("error");
    }
  };

  const handleMicToggle = () => {
    if (!recognitionRef.current) {
      setResponseText("Voice recognition engine not loaded. Tap or type commands manually instead, Operator!");
      return;
    }

    if (appStatus === "listening" || speechActiveRef.current) {
      recognitionRef.current.stop();
      setAppStatus("idle");
    } else {
      // Cancel active voice playbacks so Orion doesn't listen to himself talking
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current.lang = currentLang;
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Recognition start failed due to busy listener pool", err);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInputValue.trim()) return;

    const speech = textInputValue.trim();
    setTextInputValue("");
    handleIncomingTransmission(speech);
  };

  // Prebuilt sample prompt triggers for fast testing
  const samplePrompts = [
    { text: "Core Diagnostics report", icon: <Info className="w-3 s:w-4 h-3 s:h-4 text-[#00f3ff]" /> },
    { text: "Who is Orion A.I.?", icon: <Sparkles className="w-3 s:w-4 h-3 s:h-4 text-[#b026ff]" /> },
    { text: "What is my weather & location?", icon: <MapPin className="w-3 s:w-4 h-3 s:h-4 text-emerald-400" /> },
    { text: "Explain nuclear fusion like I'm 5", icon: <Terminal className="w-3 s:w-4 h-3 s:h-4 text-yellow-400" /> }
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans flex flex-col p-4 md:p-6 gap-4">
      {/* Immersive Cyberpunk visual decorators */}
      <div className="bg-grid"></div>
      <div className="bg-scanline"></div>
      <div className="bg-vignette"></div>

      {/* --- TOP BAR HEADER --- */}
      <header className="relative z-10 w-full flex flex-col md:flex-row items-center justify-between gap-4 border border-[#00f3ff]/15 bg-[rgba(8,16,28,0.5)] p-4 rounded-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-[#00f3ff] flex items-center justify-center bg-[#00f3ff]/5 animate-pulse">
            <span className="text-[#00f3ff] font-bold text-lg">◈</span>
          </div>
          <div className="flex flex-col">
            <h1 className="font-display font-black text-white text-lg tracking-[3px] glow-cyan">
              ORION A.I. CORE SYSTEM
            </h1>
            <span className="font-mono text-[9px] tracking-[4px] text-[#6f93a8] uppercase">
              ENCYCLOPEDIC NEURAL NET
            </span>
          </div>
        </div>

        {/* Dynamic Clock Widget */}
        <div className="text-center">
          <div className="font-display font-medium text-xl leading-none text-[#00f3ff] tracking-[4px] glow-cyan">
            {formattedTime}
          </div>
          <div className="font-mono text-[10px] text-[#6f93a8] tracking-[3px] mt-1">
            {formattedDate}
          </div>
        </div>

        {/* Real-time Environment Telemetry */}
        <div className="flex items-center gap-4 text-sm font-mono text-[11px] tracking-[1.5px]">
          <div className="flex items-center gap-2 bg-[#00f3ff]/5 px-3 py-1.5 rounded border border-[#00f3ff]/10">
            <MapPin className="w-3.5 h-3.5 text-[#00f3ff]" />
            <span className="text-[#d8f7ff] truncate max-w-[140px] uppercase font-semibold">{locationValue}</span>
          </div>
          <div className="flex items-center gap-2 bg-[#b026ff]/5 px-3 py-1.5 rounded border border-[#b026ff]/10">
            <CloudSun className="w-3.5 h-3.5 text-[#b026ff]" />
            <span className="text-purple-300 font-semibold">{weatherValue}</span>
          </div>
        </div>
      </header>

      {/* --- MAIN CONSOLE SPLIT --- */}
      <main className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4">
        
        {/* LEFT PANEL: SYSTEM METRICS & TELEMETRICS */}
        <section className="border border-[#00f3ff]/15 bg-[rgba(8,16,28,0.45)] rounded-xl backdrop-blur-md p-4 flex flex-col gap-5 min-h-0">
          <div className="border-b border-[#00f3ff]/20 pb-2">
            <h2 className="font-display text-[#00f3ff] text-xs font-bold uppercase tracking-[4px] glow-cyan flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#00f3ff]" /> SYSTEM METRICS
            </h2>
          </div>

          <div className="space-y-4 font-mono">
            {/* CPU Metric */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6f93a8] tracking-[2px] uppercase">CPU LOAD</span>
                <span className="text-[#00f3ff] font-bold tracking-[1px]">{metrics.cpu}%</span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(0,243,255,0.7)]"
                  style={{ width: `${metrics.cpu}%` }}
                ></div>
              </div>
            </div>

            {/* RAM Metric */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6f93a8] tracking-[2px] uppercase">RAM USAGE</span>
                <span className="text-[#b026ff] font-bold tracking-[1px]">{metrics.ram}%</span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(176,38,255,0.7)]"
                  style={{ width: `${metrics.ram}%` }}
                ></div>
              </div>
            </div>

            {/* LAN/Network Metric */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6f93a8] tracking-[2px] uppercase">NETWORK SPEED</span>
                <span className="text-[#00f3ff] font-bold tracking-[1px]">{metrics.net} Mb/s</span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min((metrics.net / 1000) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Power Core Metric */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6f93a8] tracking-[2px] uppercase">POWER CORE</span>
                <span className="text-purple-400 font-bold tracking-[1px]">{metrics.pwr}%</span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full border border-white/[0.05] overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-600 to-fuchsia-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(176,38,255,0.4)]"
                  style={{ width: `${metrics.pwr}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="border-b border-[#00f3ff]/20 pb-2 mt-2">
            <h2 className="font-display text-[#00f3ff] text-xs font-bold uppercase tracking-[4px] glow-cyan flex items-center gap-2">
              <Database className="w-4 h-4 text-[#00f3ff]" /> DIAGNOSTICS
            </h2>
          </div>

          <ul className="space-y-3.5 text-xs font-mono tracking-[1.5px] text-[#d8f7ff]">
            <li className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00f3ff] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00f3ff]"></span>
                </span>
                <span>NEURAL NETWORK</span>
              </div>
              <em className="text-emerald-400 font-semibold not-italic">STABLE</em>
            </li>
            <li className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {appStatus === "listening" || appStatus === "speaking" ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#b026ff]"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  )}
                </span>
                <span>VOICE ENGINE</span>
              </div>
              <em className="text-[#00f3ff] font-semibold not-italic uppercase">
                {appStatus === "listening" ? "LISTENING" : appStatus === "speaking" ? "SPEAKING" : "READY"}
              </em>
            </li>
            <li className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                </span>
                <span>METRICS LINK</span>
              </div>
              <em className="text-yellow-400 font-semibold not-italic">STABLE</em>
            </li>
            <li className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00f3ff]"></span>
                <span>GEO CONTEXT</span>
              </div>
              <em className="text-[#00f3ff] font-semibold not-italic uppercase">ACTIVE</em>
            </li>
          </ul>

          <div className="mt-auto pt-4 border-t border-[#00f3ff]/10 text-center">
            <div className="flex justify-center items-center gap-2 text-[#6f93a8] text-[10px] font-mono tracking-[1px]">
              <Radio className="w-3.5 h-3.5 text-[#00f3ff] animate-pulse" />
              <span>SATELLITE DOWNLINK LINKED</span>
            </div>
          </div>
        </section>

        {/* CENTER COLUMN: GLOBAL CORE ORB & INTERACTIVE CONTROLS */}
        <section className="flex flex-col justify-between items-center gap-6 min-h-0 border border-[#00f3ff]/15 bg-[rgba(8,16,28,0.3)] rounded-xl backdrop-blur-md p-4 md:p-6 overflow-y-auto">
          
          {/* Status Display Pill */}
          <div className={`status-pill px-5 py-2.5 rounded-full border flex items-center gap-2.5 font-display text-[11px] tracking-[3px] uppercase ${
            appStatus === "listening" ? "text-[#b026ff] border-[#b026ff]/30 bg-purple-500/5 shadow-[0_0_12px_rgba(176,38,255,0.2)]" :
            appStatus === "processing" ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/5 shadow-[0_0_12px_rgba(234,179,8,0.2)]" :
            appStatus === "speaking" ? "text-[#00f3ff] border-[#00f3ff]/30 bg-cyan-500/5 shadow-[0_0_12px_rgba(0,243,255,0.2)]" :
            appStatus === "error" ? "text-rose-500 border-rose-500/30 bg-rose-500/5 shadow-[0_0_12px_rgba(244,63,94,0.3)]" :
            "text-[#00f3ff] border-[#00f3ff]/15 bg-cyan-500/[0.02]"
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${
              appStatus === "listening" ? "bg-[#b026ff] animate-ping" :
              appStatus === "processing" ? "bg-yellow-400 animate-pulse" :
              appStatus === "speaking" ? "bg-[#00f3ff] animate-ping" :
              appStatus === "error" ? "bg-rose-500" :
              "bg-[#00f3ff]"
            }`}></span>
            <span>
              {appStatus === "listening" ? "ORION: LISTENING" :
               appStatus === "processing" ? "ORION: COMPUTING" :
               appStatus === "speaking" ? "ORION: RESPONDING" :
               appStatus === "error" ? "ORION: SYSTEM ERROR" :
               "ORION: COLD STANDBY"}
            </span>
          </div>

          {/* QUANTUM ORION CORE ORB (AESTHETICALLY SUPERIOR & FUNCTIONAL) */}
          <div className="relative w-56 h-56 md:w-64 md:h-64 flex items-center justify-center">
            
            {/* outer ring 1 */}
            <div className="absolute inset-0 rounded-full border border-dashed border-[#00f3ff]/30 animate-spin-slow"></div>

            {/* mid ring 2 */}
            <div className="absolute inset-[15%] rounded-full border border-[#b026ff]/30 animate-spin-reverse-medium border-t-2 border-r-2 border-b-0 border-l-0"></div>

            {/* inner dashed ring */}
            <div className="absolute inset-[28%] rounded-full border border-dashed border-[#00f3ff]/15 animate-spin-slowest"></div>

            {/* visualizer bars (Staggered audio simulation overlay during speech/listening) */}
            <div className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-opacity duration-300 z-10 ${
              appStatus === "listening" || appStatus === "speaking" ? "opacity-100" : "opacity-0"
            }`}>
              {Array.from({ length: 15 }).map((_, i) => (
                <span 
                  key={i} 
                  className={`w-[4px] rounded-full transition-colors duration-300 ${
                    appStatus === "listening" ? "bg-[#b026ff]" : "bg-[#00f3ff]"
                  }`}
                  style={{
                    height: "15%",
                    animation: `${appStatus === "listening" ? "waveListen 0.9s" : "waveSpeak 1.2s"} ease-in-out infinite ${i * 0.08}s`
                  }}
                ></span>
              ))}
            </div>

            {/* Glowing Core Background Blob */}
            <div 
              className="absolute inset-[20%] rounded-full opacity-60 mix-blend-screen"
              style={{
                background: "radial-gradient(circle at 40% 40%, #00f3ff, #b026ff 60%, transparent 90%)",
                animation: "corePulseGlow 3s ease-in-out infinite"
              }}
            ></div>

            {/* Solid Central Disk Controller */}
            <button 
              onClick={handleMicToggle}
              title="Click to engage core speaker link"
              className="absolute inset-[33%] rounded-full bg-slate-950 border border-[#00f3ff]/40 shadow-[0_0_20px_rgba(0,243,255,0.2)] flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95 focus:outline-none cursor-pointer z-20 group"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#004e57] to-[#3a005c] opacity-20 group-hover:opacity-40 transition-opacity"></div>
              {appStatus === "listening" ? (
                <MicOff className="w-8 h-8 text-[#b026ff] animate-pulse" />
              ) : (
                <Mic className="w-8 h-8 text-[#00f3ff] group-hover:drop-shadow-[0_0_5px_#00f3ff]" />
              )}
            </button>
          </div>

          {/* Master Output Text Frame */}
          <div className="w-full max-w-[500px] text-center px-4 flex flex-col gap-1 flex-1 justify-center">
            <span className="font-mono text-[10px] uppercase text-[#6f93a8] tracking-[2px]">Core Output Stream</span>
            <p className="text-[#d8f7ff] font-sans font-medium text-sm md:text-base leading-relaxed tracking-[0.5px]">
              {responseText}
            </p>
          </div>

          {/* Prompt Presets Row */}
          <div className="w-full flex-wrap justify-center gap-2 hidden sm:flex">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleIncomingTransmission(p.text)}
                className="flex items-center gap-2 border border-[#00f3ff]/10 hover:border-[#00f3ff]/30 bg-slate-950/40 hover:bg-[#00f3ff]/5 text-[11px] font-mono text-[#d8f7ff] px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer"
              >
                {p.icon}
                <span>{p.text}</span>
              </button>
            ))}
          </div>

          {/* CONTROLS CLUSTER: Language Toggle, Text input console */}
          <div className="w-full flex flex-col sm:flex-row items-center gap-4 border-t border-[#00f3ff]/10 pt-4 mt-auto">
            
            {/* Audio Synthesis Toggle & Language selection */}
            <div className="flex items-center gap-2">
              {/* Speaker mute/unmute visual toggler */}
              <button
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className={`p-2 rounded-lg border flex items-center justify-center transition-all ${
                  isMuted 
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" 
                    : "border-[#00f3ff]/30 bg-[#00f3ff]/5 text-[#00f3ff] hover:bg-[#00f3ff]/15"
                }`}
                title={isMuted ? "Voice speech synthesis muted" : "Voice speech synthesis active"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Language selection switches */}
              <div className="flex border border-[#00f3ff]/20 bg-[#00f3ff]/5 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCurrentLang("en-IN")}
                  className={`px-3 py-1.5 text-xs font-display tracking-[1.5px] cursor-pointer transition-colors ${
                    currentLang === "en-IN" ? "bg-[#00f3ff] text-black font-semibold" : "text-[#6f93a8] hover:text-white"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentLang("hi-IN")}
                  className={`px-3 py-1.5 text-xs font-display tracking-[1.5px] cursor-pointer transition-colors ${
                    currentLang === "hi-IN" ? "bg-[#00f3ff] text-black font-semibold" : "text-[#6f93a8] hover:text-white"
                  }`}
                >
                  हिं
                </button>
              </div>
            </div>

            {/* Offline manual command submission form */}
            <form onSubmit={handleFormSubmit} className="flex-1 w-full flex items-center gap-2 bg-[#00f3ff]/5 border border-[#00f3ff]/15 rounded-xl px-3 py-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
              <input
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                placeholder="Transmit manual parameters to Orion core..."
                className="flex-1 bg-transparent text-[#d8f7ff] text-xs font-mono tracking-[1px] placeholder-[#6f93a8] py-1 outline-none text-left"
              />
              <button 
                type="submit"
                className="w-8 h-8 rounded-full bg-[#00f3ff] text-black hover:bg-cyan-300 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-[0_0_8px_rgba(0,243,255,0.4)]"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

          </div>
        </section>

        {/* RIGHT COLUMN: TERMINAL TRANSCRIPT LOGS */}
        <section className="border border-[#00f3ff]/15 bg-[rgba(8,16,28,0.45)] rounded-xl backdrop-blur-md p-4 flex flex-col gap-4 min-h-0">
          <div className="border-b border-[#00f3ff]/20 pb-2 flex justify-between items-center">
            <h2 className="font-display text-[#00f3ff] text-xs font-bold uppercase tracking-[4px] glow-cyan flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#00f3ff]" /> TRANSCRIPT LOG
            </h2>
            <button
              onClick={() => {
                setTranscriptLog([
                  { sender: "assistant", text: "Systems nominal. Awaiting your command, Operator.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
                ]);
                setResponseText("Log register cleared. Core standing by.");
              }}
              className="text-[#6f93a8] hover:text-rose-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
              title="Reset register backlog"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Chat box */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1"
          >
            {transcriptLog.map((log, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-lg border text-xs font-mono leading-relaxed transition-all relative ${
                  log.sender === "user" 
                    ? "border-purple-500/20 bg-purple-500/[0.03] text-[#d8f7ff] border-l-4 border-l-[#b026ff]" 
                    : "border-[#00f3ff]/10 bg-cyan-500/[0.03] text-cyan-50 border-l-4 border-l-[#00f3ff]"
                }`}
                style={{ animation: "fadeInY 0.35s ease-out" }}
              >
                <div className="flex justify-between items-center mb-1 text-[10px] tracking-[1.5px]">
                  <span className={`font-bold ${log.sender === "user" ? "text-purple-400" : "text-[#00f3ff]"}`}>
                    {log.sender === "user" ? "YOU" : "ORION SYSTEM"}
                  </span>
                  <span className="text-slate-500 font-light">{log.time}</span>
                </div>
                <p className="whitespace-pre-line tracking-[0.5px]">
                  {log.text}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800 text-[10px] text-center text-[#6f93a8] font-mono tracking-[1px]">
            ACTIVE TRANSMISSION REGISTERS: {transcriptLog.length} / 100
          </div>
        </section>

      </main>
    </div>
  );
}
