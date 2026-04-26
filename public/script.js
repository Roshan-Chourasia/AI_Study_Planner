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
		for (let i = 0; i < fileInput.files.length; i++) {
			formData.append("notesFiles", fileInput.files[i]);
		}
	}
	
	try {
		// Loading state
		btn.disabled = true;
		btn.innerHTML = `<span class="btn-inner"><span class="spinner"></span><span>Generating...</span></span>`;
		renderSkeleton(outputDiv);
		extraDiv.innerHTML = "";
		outputDiv.setAttribute("contenteditable", "false");
		extraDiv.setAttribute("contenteditable", "false");
		document.getElementById("action-bar").classList.add("hidden");

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
		} else {
			// Show the action bar if we have content
			document.getElementById("action-bar").classList.remove("hidden");
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
				const count = e.target.files.length;
				fileLabel.textContent = `Selected: ${count} file${count > 1 ? 's' : ''}`;
				fileLabel.style.color = "var(--accent-2)";
			} else {
				fileLabel.textContent = "Upload Notes (PDF, Word, PPT, Text)";
				fileLabel.style.color = "var(--muted)";
			}
		});
	}
});

function toggleEdit() {
	const output = document.getElementById("output");
	const extra = document.getElementById("extra-content");
	const editBtn = document.getElementById("editBtn");
	const saveBtn = document.getElementById("saveBtn");

	// Make items editable
	output.setAttribute("contenteditable", "true");
	extra.setAttribute("contenteditable", "true");

	// Toggle buttons
	editBtn.classList.add("hidden");
	saveBtn.classList.remove("hidden");
}

function toggleSave() {
	const output = document.getElementById("output");
	const extra = document.getElementById("extra-content");
	const editBtn = document.getElementById("editBtn");
	const saveBtn = document.getElementById("saveBtn");

	// Make items non-editable
	output.setAttribute("contenteditable", "false");
	extra.setAttribute("contenteditable", "false");

	// Toggle buttons
	saveBtn.classList.add("hidden");
	editBtn.classList.remove("hidden");
}

async function downloadImage() {
	const container = document.querySelector(".container");
	const actionBar = document.getElementById("action-bar");
	const output = document.getElementById("output");
	const extra = document.getElementById("extra-content");
	const downloadBtn = document.getElementById("downloadBtn");
	
	// Temporarily hide the action bar and controls for the screenshot
	const controls = document.querySelector(".controls");
	const header = document.querySelector(".header");
	
	actionBar.classList.add("hidden");
	controls.classList.add("hidden");
	
	// Create a wrapper for what we want to download
	const downloadArea = document.createElement("div");
	downloadArea.style.position = "fixed";
	downloadArea.style.left = "-9999px";
	downloadArea.style.top = "0";
	downloadArea.style.padding = "40px";
	downloadArea.style.background = "var(--bg)";
	downloadArea.style.color = "var(--text)";
	downloadArea.style.fontFamily = "inherit";
	downloadArea.style.minHeight = "100vh";
	downloadArea.style.width = "1200px"; // Fixed width for consistent quality
	
	// Add title
	const title = document.createElement("h1");
	title.textContent = "My Study Plan";
	title.style.marginBottom = "30px";
	title.style.textAlign = "center";
	title.style.color = "var(--accent)";
	downloadArea.appendChild(title);

	// Clone output and extra content
	const outputClone = output.cloneNode(true);
	const extraClone = extra.cloneNode(true);
	
	// Fix grid layout for the screenshot
	outputClone.style.display = "grid";
	outputClone.style.gridTemplateColumns = "repeat(2, 1fr)";
	outputClone.style.gap = "20px";
	
	extraClone.style.display = "grid";
	extraClone.style.gridTemplateColumns = "repeat(2, 1fr)";
	extraClone.style.gap = "20px";
	extraClone.style.marginTop = "30px";

	downloadArea.appendChild(outputClone);
	downloadArea.appendChild(extraClone);
	
	// Add branding
	const footer = document.createElement("p");
	footer.textContent = "Generated by AI Study Planner";
	footer.style.marginTop = "40px";
	footer.style.textAlign = "center";
	footer.style.opacity = "0.5";
	downloadArea.appendChild(footer);

	document.body.appendChild(downloadArea);

	try {
		downloadBtn.innerHTML = `<span class="btn-inner"><span class="spinner"></span><span>Preparing...</span></span>`;
		
		const canvas = await html2canvas(downloadArea, {
			backgroundColor: "#0b1020",
			scale: 2, // Higher quality
			useCORS: true,
			logging: false,
			width: 1200
		});
		
		const link = document.createElement("a");
		link.download = `StudyPlan_${new Date().toLocaleDateString().replace(/\//g, '-')}.png`;
		link.href = canvas.toDataURL("image/png");
		link.click();
	} catch (err) {
		console.error("Download failed:", err);
		alert("Failed to generate image. Please try again.");
	} finally {
		document.body.removeChild(downloadArea);
		actionBar.classList.remove("hidden");
		controls.classList.remove("hidden");
		downloadBtn.innerHTML = `<span class="btn-inner">🖼️ Download Image</span>`;
	}
}

window.toggleEdit = toggleEdit;
window.toggleSave = toggleSave;
window.downloadImage = downloadImage;

