import { useRef, useState, useEffect } from "react";
import { createDecartClient, models } from "@decartai/sdk";
import { getCurrentApiKey, rotateToNextKey, totalKeys } from "./services/apiKeyRotator";

function App() {
  const originalVideoRef = useRef(null);
  const editedVideoRef = useRef(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [enhance, setEnhance] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rawStream, setRawStream] = useState(null);
  const [editedStream, setEditedStream] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setReferenceImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Attache les flux UNE FOIS que les vidéos existent dans le DOM
  useEffect(() => {
    if (isLive && rawStream && originalVideoRef.current) {
      originalVideoRef.current.srcObject = rawStream;
    }
  }, [isLive, rawStream]);

  useEffect(() => {
    if (isLive && editedStream && editedVideoRef.current) {
      editedVideoRef.current.srcObject = editedStream;
    }
  }, [isLive, editedStream]);

  // Détecte si l'erreur/raison ressemble à un problème de crédits/quota sur la clé API
  const isCreditOrQuotaError = (err) => {
    console.log("DEBUG isCreditOrQuotaError reçoit:", err); // ← ligne de debug ajoutée
    const msg = (err?.message || JSON.stringify(err || "")).toLowerCase();
    return (
      msg.includes("credit") ||
      msg.includes("quota") ||
      msg.includes("insufficient") ||
      msg.includes("429") ||
      msg.includes("402")
    );
  };

  const connectWithClient = (apiKey, stream, model) => {
    const client = createDecartClient({ apiKey });

    return client.realtime.connect(stream, {
      model,
      mirror: "auto",
      initialState: {
        image: referenceImage,
        prompt: {
          text: prompt || "Transforme le sujet pour qu'il ressemble à l'image de référence",
          enhance,
        },
      },
      onRemoteStream: (newEditedStream) => {
        setEditedStream(newEditedStream);
        setIsLive(true);
        setLoading(false);
      },
      // Ces deux callbacks manquaient : sans eux, une coupure de crédit
      // EN COURS de session ne remontait jamais dans le code.
      onError: (err) => {
        console.warn("Erreur realtime:", err);
        if (isCreditOrQuotaError(err)) {
          handleRuntimeFailover(stream, model);
        }
      },
      onDisconnect: (reason) => {
        console.warn("Déconnecté:", reason);
        if (isCreditOrQuotaError(reason)) {
          handleRuntimeFailover(stream, model);
        }
      },
    });
  };

  // Reconnexion automatique en cas de coupure liée au crédit/quota,
  // sans redemander l'accès caméra (on réutilise le stream déjà capturé).
  const handleRuntimeFailover = async (stream, model) => {
    if (totalKeys() <= 1) {
      alert("Toutes les clés API sont épuisées.");
      setIsLive(false);
      setLoading(false);
      return;
    }

    console.warn("🔄 Coupure liée au crédit, rotation et reconnexion...");
    rotateToNextKey();
    setLoading(true);

    try {
      await connectWithClient(getCurrentApiKey(), stream, model);
    } catch (err) {
      if (isCreditOrQuotaError(err)) {
        handleRuntimeFailover(stream, model); // essaie la clé suivante
      } else {
        alert("Erreur: " + (err.message || JSON.stringify(err)));
        setLoading(false);
      }
    }
  };

  const goLive = async () => {
    setLoading(true);

    const model = models.realtime("lucy-2.1");
    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { frameRate: model.fps, width: model.width, height: model.height },
      });
      setRawStream(stream);
    } catch (err) {
      alert("Impossible d'accéder à la caméra : " + (err.message || JSON.stringify(err)));
      setLoading(false);
      return;
    }

    // Boucle de tentatives : si une clé API échoue dès la connexion initiale
    // (crédits/quota déjà épuisés), on bascule automatiquement sur la suivante.
    const maxAttempts = totalKeys();
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = getCurrentApiKey();

      try {
        await connectWithClient(apiKey, stream, model);
        return; // succès, onRemoteStream gère la suite
      } catch (err) {
        lastError = err;

        if (isCreditOrQuotaError(err) && attempt < maxAttempts - 1) {
          console.warn(`Clé #${attempt + 1} indisponible, tentative suivante...`);
          rotateToNextKey();
          continue;
        }

        break;
      }
    }

    alert("Erreur: " + (lastError?.message || JSON.stringify(lastError)));
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div
        className={`bg-slate-950/60 backdrop-blur border border-slate-700 rounded-2xl shadow-2xl p-8 w-full transition-all ${
          isLive ? "max-w-5xl" : "max-w-md"
        }`}
      >
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          🎭 Live Avatar
        </h1>

        {!isLive ? (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                1. Photo de référence
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm hover:file:bg-indigo-500 cursor-pointer"
              />
              {referenceImage && (
                <img
                  src={referenceImage}
                  alt="référence"
                  className="mt-3 w-28 h-28 object-cover rounded-xl border border-slate-600"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                2. Effet (optionnel)
              </label>
              <input
                type="text"
                placeholder="ex: ajoute des lunettes de soleil"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={enhance}
                onChange={(e) => setEnhance(e.target.checked)}
                className="rounded accent-indigo-600"
              />
              Améliorer automatiquement le prompt
            </label>

            <button
              onClick={goLive}
              disabled={!referenceImage || loading}
              className="w-full py-3 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Connexion..." : "🔴 Passer en Live"}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => window.location.reload()}
              className="mb-4 text-sm text-slate-400 hover:text-white transition"
            >
              ← Recommencer
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-400 text-sm mb-2">Toi (original)</p>
                <video
                  ref={originalVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-xl border border-slate-700"
                />
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Transformé</p>
                <video
                  ref={editedVideoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-xl border border-indigo-500"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;