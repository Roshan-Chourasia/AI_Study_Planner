const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function renderSkeleton(outputDiv) {
	outputDiv.innerHTML = "";
	DAYS.forEach(day => {
		const card = document.createElement("div");
		card.className = "day-card";
		const title = document.createElement("div");
		title.className = "day-title";
		title.innerHTML = `<span class='pill'></span>${day}`;
		card.appendChild(title);
		for (let i = 0; i < 2; i++) {
			const slot = document.createElement("div");
			slot.className = "slot skeleton";
			const time = document.createElement("div");
			time.className = "shimmer";
			time.style.height = "16px";
			time.style.width = "120px";
			const act = document.createElement("div");
			act.className = "shimmer";
			act.style.height = "16px";
			act.style.width = "100%";
			slot.appendChild(time);
			slot.appendChild(act);
			card.appendChild(slot);
		}
		outputDiv.appendChild(card);
	});
}

async function generate() {
	const description = document.getElementById("input").value;
	const outputDiv = document.getElementById("output");
	const btn = document.getElementById("generateBtn");
	
	if (!description.trim()) {
		outputDiv.innerHTML = "<div class='alert alert-info'>Please enter a description for your study plan.</div>";
		return;
	}
	
	try {
		// Loading state
		btn.disabled = true;
		btn.innerHTML = `<span class="btn-inner"><span class="spinner"></span><span>Generating...</span></span>`;
		renderSkeleton(outputDiv);
		const res = await fetch("/generate", {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({ description })
		});
		
		const data = await res.json();
		
		// Check if the response contains an error
		if (data.error) {
			outputDiv.innerHTML = `<div class='alert alert-error'><strong>Error:</strong> ${data.error}<br><span style='opacity:.9'>${data.detail || 'No additional details'}</span></div>`;
			return;
		}
		
		// Check if the response is not an object or doesn't have the expected structure
		if (typeof data !== 'object' || data === null) {
			outputDiv.innerHTML = "<div class='alert alert-error'>Invalid response format received from server.</div>";
			return;
		}
		
		outputDiv.innerHTML = "";

		// Normalize and render in weekday order, ensuring Saturday appears
		const normalized = {};
		DAYS.forEach(d => { normalized[d] = Array.isArray(data[d]) ? data[d] : []; });
		
		for (const day of DAYS) {
			const dayCard = document.createElement("div");
			dayCard.className = "day-card";

			const h = document.createElement("h2");
			h.className = "day-title";
			h.innerHTML = `<span class='pill'></span>${day}`;
			dayCard.appendChild(h);
			
			if (Array.isArray(normalized[day]) && normalized[day].length > 0) {
				normalized[day].forEach(s => {
					const slot = document.createElement("div");
					slot.className = "slot";
					const time = document.createElement("div");
					time.className = "time";
					time.textContent = `${s.startTime} – ${s.endTime}`;
					const activity = document.createElement("div");
					activity.className = "activity";
					activity.textContent = s.activity;
					slot.appendChild(time);
					slot.appendChild(activity);
					dayCard.appendChild(slot);
				});
			} else {
				const p = document.createElement("p");
				p.className = "empty";
				p.textContent = "No activities scheduled for this day.";
				dayCard.appendChild(p);
			}
			outputDiv.appendChild(dayCard);
		}
		
		// If no days were processed, show a message
		if (Object.keys(data).length === 0) {
			outputDiv.innerHTML = "<div class='alert alert-warn'>No study plan was generated. Please try again with a different description.</div>";
		}
		
	} catch (error) {
		console.error("Error:", error);
		outputDiv.innerHTML = `<div class='alert alert-error'>Failed to generate study plan: ${error.message}</div>`;
	} finally {
		btn.disabled = false;
		btn.innerHTML = `<span class="btn-inner"><span>Generate</span></span>`;
	}
}

// Expose generate to global scope for onclick handler
window.generate = generate;

