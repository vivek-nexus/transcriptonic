/**
 * Legge un file .txt e restituisce una Promise col contenuto testuale.
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsText(file);
    });
}

// Variabile per memorizzare la notizia selezionata
let selectedNotizia = null;
let transcriptionContent = null;

// Funzione per mostrare il modal di successo
function showModal() {
    document.getElementById("successModal").classList.add("show");
}

// Funzione per chiudere il modal
function closeModal() {
    document.getElementById("successModal").classList.remove("show");
}

// Carica il contenuto della trascrizione dallo storage quando la pagina viene caricata
document.addEventListener("DOMContentLoaded", function() {
    // Recuperiamo la trascrizione dall'estensione
    chrome.storage.local.get(["transcriptContent"], function(result) {
        if (result.transcriptContent) {
            transcriptionContent = result.transcriptContent;
            console.log("Trascrizione caricata con successo dall'estensione.");
        } else {
            console.error("Nessuna trascrizione trovata nello storage.");
        }
    });
});

// Gestore per il pulsante "Trova le migliori notizie"
document.getElementById("analyzeBtn").addEventListener("click", async function() {
    // Verifica validità nome e cognome
    const name = document.getElementById("name").value.trim();
    const surname = document.getElementById("surname").value.trim();

    if (!name || !surname) {
        alert("Inserisci nome e cognome prima di generare gli argomenti.");
        return;
    }

    // Verifichiamo che abbiamo il contenuto della trascrizione
    if (!transcriptionContent) {
        alert("Nessuna trascrizione trovata. Riprova o contatta l'assistenza.");
        return;
    }

    // Mostra spinner di caricamento
    document.getElementById("loadingSpinner").style.display = "flex";
    document.getElementById("analyzeBtn").disabled = true;

    // Invia al webhook per la generazione degli argomenti
    fetch("https://hook.eu2.make.com/1n8vpjeaxeq9texxarnfnv6bcj4uwcel", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            transcript: transcriptionContent,
            name: name,
            surname: surname
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Errore nella generazione degli argomenti");
        }
        return response.json();
    })
    .then(data => {
        // Nascondi spinner
        document.getElementById("loadingSpinner").style.display = "none";
        
        // Mostra le notizie generate
        renderNotizie(data.notizie);
        
        // Mostra il container delle notizie
        document.getElementById("notizieContainer").style.display = "block";
        
        // Nascondi il pulsante di generazione
        document.getElementById("analyzeBtn").style.display = "none";
    })
    .catch(error => {
        console.error("Errore:", error);
        alert("Si è verificato un errore durante la generazione degli argomenti. Riprova.");
        document.getElementById("loadingSpinner").style.display = "none";
        document.getElementById("analyzeBtn").disabled = false;
    });
});

/**
 * Renderizza le notizie ricevute dal webhook
 */
function renderNotizie(notizie) {
    const container = document.getElementById("notizieLista");
    container.innerHTML = "";

    // Per ogni notizia nel JSON
    Object.keys(notizie).forEach(key => {
        const notizia = notizie[key];
        const card = document.createElement("div");
        card.className = "notizia-card";
        card.dataset.id = key;
        card.dataset.titolo = notizia.titolo;
        
        // Popola la card con i dettagli della notizia
        card.innerHTML = `
            <div class="notizia-titolo">${notizia.titolo}</div>
            <div class="notizia-descrizione">${notizia.descrizione}</div>
            <div class="notizia-motivo">${notizia.motivo}</div>
        `;
        
        // Aggiungi gestore click per selezionare la notizia
        card.addEventListener("click", function() {
            // Deseleziona tutte le altre card
            document.querySelectorAll(".notizia-card").forEach(c => c.classList.remove("selected"));
            
            // Seleziona questa card
            this.classList.add("selected");
            
            // Salva la notizia selezionata
            selectedNotizia = {
                id: this.dataset.id,
                titolo: notizia.titolo,
                descrizione: notizia.descrizione,
                motivo: notizia.motivo
            };
            
            // Aggiorna l'anteprima nel secondo step
            document.getElementById("argomentoScelto").innerHTML = `
                <div class="notizia-titolo">${notizia.titolo}</div>
                <div class="notizia-descrizione">${notizia.descrizione}</div>
                <div class="notizia-motivo">${notizia.motivo}</div>
            `;
            
            // Mostra il secondo step del form
            document.getElementById("formStep1").style.display = "none";
            document.getElementById("formStep2").style.display = "block";
        });
        
        container.appendChild(card);
    });
}

// Gestore pulsante "Cambia argomento"
document.getElementById("changeArgomentoBtn").addEventListener("click", function() {
    document.getElementById("formStep1").style.display = "block";
    document.getElementById("formStep2").style.display = "none";
});

// Inviare i dati del form al webhook quando viene inviato
document.getElementById("modalForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    // Se non è stata selezionata una notizia
    if (!selectedNotizia) {
        alert("Devi selezionare un argomento principale prima di inviare la richiesta.");
        return;
    }

    // Raccogliamo i dati del form
    const formData = {
        name: document.getElementById("name").value,
        surname: document.getElementById("surname").value,
        client: selectedNotizia.titolo, // Usiamo il titolo della notizia selezionata come argomento principale
        email: document.getElementById("email").value,
        phone: document.getElementById("phone").value,
        product: document.getElementById("product").value,  // Opzionale
        target: document.getElementById("target").value     // Opzionale
    };

    // Prepariamo il payload per l'invio al webhook
    const payload = {
        ...formData,
        transcript: transcriptionContent
    };

    // Eseguo la POST verso Make/Integromat
    fetch("https://hook.eu2.make.com/tbmgalyshveil5lp0hdekvi0lt2hh989", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (response.ok) {
            // Mostra il modal di successo
            showModal();
            
            // Reset del form e delle variabili
            document.getElementById("modalForm").reset();
            document.getElementById("notizieContainer").style.display = "none";
            document.getElementById("analyzeBtn").style.display = "block";
            document.getElementById("analyzeBtn").disabled = false;
            document.getElementById("formStep1").style.display = "block";
            document.getElementById("formStep2").style.display = "none";
            
            // Reset delle variabili
            selectedNotizia = null;
            transcriptionContent = null;
        } else {
            alert("Errore durante l'invio.");
        }
    })
    .catch(error => {
        console.error("Errore:", error);
        alert("Si è verificato un errore durante l'invio della richiesta.");
    });
});
