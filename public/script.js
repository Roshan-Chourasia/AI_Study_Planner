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
			time.style.width = "80px";
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
	const fileInput = document.getElementById("notes-upload");
	const outputDiv = document.getElementById("output");
	const extraDiv = document.getElementById("extra-content");
	const btn = document.getElementById("generateBtn");
	
	if (!description.trim()) {
		outputDiv.innerHTML = "<div class='alert alert-info'>Please enter a description for your study plan.</div>";
		return;
	}

	let notes = "";
	const formData = new FormData();
	formData.append("description", description);

	if (fileInput.files.length > 0) {
		formData.append("notesFile", fileInput.files[0]);
	}
	
	try {
		// Loading state
		btn.disabled = true;
		btn.innerHTML = `<span class="btn-inner"><span class="spinner"></span><span>Generating...</span></span>`;
		renderSkeleton(outputDiv);
		extraDiv.innerHTML = "";

		const res = await fetch("/generate", {
			method: "POST",
			body: formData
		});
		
		const data = await res.json();
		
		// Check if the response contains an error
		if (data.error) {
			outputDiv.innerHTML = `<div class='alert alert-error'><strong>Error:</strong> ${data.error}<br><span style='opacity:.9'>${data.detail || 'No additional details'}</span></div>`;
			return;
		}
		
		outputDiv.innerHTML = "";
		const timetableData = data.timetable || data; // Fallback for old format

		// Normalize and render in weekday order
		const normalized = {};
		DAYS.forEach(d => { normalized[d] = Array.isArray(timetableData[d]) ? timetableData[d] : []; });
		
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

		// Render Extra Content (Topics and Questions)
		if (data.importantTopics || data.importantQuestions) {
			extraDiv.innerHTML = `
				<div class="extra-card">
					<h3><span class="file-icon">🎯</span> Important Topics</h3>
					<ul>
						${(data.importantTopics || []).map(t => `<li>${t}</li>`).join('')}
					</ul>
				</div>
				<div class="extra-card">
					<h3><span class="file-icon">❓</span> Important Questions</h3>
					<ul>
						${(data.importantQuestions || []).map(q => `<li>${q}</li>`).join('')}
					</ul>
				</div>
			`;
		}
		
		// If no days were processed, show a message
		if (Object.keys(timetableData).length === 0) {
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

// Add event listener for file input to show selected filename
document.addEventListener('DOMContentLoaded', () => {
	const fileInput = document.getElementById("notes-upload");
	const fileLabel = document.querySelector(".file-label span:nth-child(2)");
	
	if (fileInput) {
		fileInput.addEventListener('change', (e) => {
			if (e.target.files.length > 0) {
				fileLabel.textContent = `Selected: ${e.target.files[0].name}`;
				fileLabel.style.color = "var(--accent-2)";
			} else {
				fileLabel.textContent = "Upload Notes (Text)";
				fileLabel.style.color = "var(--muted)";
			}
		});
	}
});

