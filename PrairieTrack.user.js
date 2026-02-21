// ==UserScript==
// @name         PrairieTrack
// @namespace    https://github.com/caburum/prairie-track
// @version      1.5.1
// @description  Keep track of PrairieLearn and PrairieTest!
// @author       caburum
// @match        *://*.prairielearn.com/*
// @grant        GM_xmlhttpRequest
// @connect      us.prairietest.com
// @run-at       document-end
// ==/UserScript==

(() => {
	"use strict";

	// Check if we should run on this page
	const pathname = location.pathname.replace(/\/$/, ''); // Strip trailing slash
	const isAssessmentsPage = pathname.endsWith("assessments");
	const isPrairieLearnPage = pathname === "" || pathname.endsWith("pl");
	if (!isAssessmentsPage && !isPrairieLearnPage) {
		return;
	}

	// Configuration
	const STALE_TIME_MS = 3 * 60 * 60 * 1000; // 3 hours
	const RELOAD_DELAY_MS = 500; // Delay before reloading page after successful fetch

	function showToast(message, type = 'info', autohide = true, onClose = null) {
		let toastContainer = document.getElementById('prairietrack-toast-container');
		if (!toastContainer) {
			toastContainer = document.createElement('div');
			toastContainer.id = 'prairietrack-toast-container';
			toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
			toastContainer.style.zIndex = '9999';
			document.body.appendChild(toastContainer);
		}

		const config = {
			'success': { bg: 'success', text: 'white',  icon: 'bi-check-circle-fill' },
			'error': { bg: 'danger', text: 'white', icon: 'bi-x-circle-fill' },
			'warning': { bg: 'warning', text: 'dark', icon: 'bi-exclamation-triangle-fill' }
		}[type] || { bg: 'primary', text: 'white', icon: 'bi-info-circle-fill' };

		const toastId = 'toast-' + Math.random().toString(36).substr(2, 9);
		const toastHtml = `
			<div id="${toastId}" class="toast align-items-center bg-${config.bg} text-${config.text} border-0" role="alert" aria-live="assertive" aria-atomic="true">
				<div class="d-flex">
					<div class="toast-body">
						<i class="bi ${config.icon} me-2"></i>${message}
					</div>
					<button type="button" class="btn-close btn-close-${config.text} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
				</div>
			</div>
		`;

		toastContainer.insertAdjacentHTML('beforeend', toastHtml);
		const toastElement = document.getElementById(toastId);
		const bsToast = new bootstrap.Toast(toastElement, { autohide: autohide, delay: 4000 });
		bsToast.show();

		toastElement.addEventListener('hidden.bs.toast', () => {
			if (onClose) onClose();
			toastElement.remove();
		});
	}

	// Check if data is stale
	function isDataStale(timestamp) {
		if (!timestamp) return true;
		return Date.now() - timestamp > STALE_TIME_MS;
	}

	// Helper functions for time remaining calculations
	function getTimeRemaining(end) {
		var t = Date.parse(end) - Date.parse(new Date());
		var seconds = Math.floor((t / 1000) % 60);
		var minutes = Math.floor((t / 1000 / 60) % 60);
		var hours = Math.floor((t / (1000 * 60 * 60)) % 24);
		var days = Math.floor(t / (1000 * 60 * 60 * 24));
		return {
			total: t,
			days: days,
			hours: hours,
			minutes: minutes,
			seconds: seconds,
		};
	}

	function dueToDateFromString(dueString) {
		const time = dueString.split(", ");
		return new Date(new Date().getFullYear() + ' ' + time[1] + ' ' + time[2]);
	}

	// Helper function to create the card structure (header and reload button are the same for both states)
	function createCardStructure() {
		const div = document.createElement("div");
		div.classList.add("card", "mb-4");
		const parent = document.getElementById("content");
		parent.insertBefore(div, parent.firstChild);

		div.innerHTML = /* html */ `
			<div class="card-header bg-primary text-white d-flex align-items-center">PrairieTrack
				<button type="button" class="btn btn-light btn-sm ms-auto ${
					isPrairieLearnPage ? "" : "d-none"
				}" id="prairietrack-reload-btn">
					<i class="bi bi-arrow-repeat me-sm-1" aria-hidden="true"></i>
					<span class="d-none d-sm-inline">Reload</span>
				</button>
			</div>
			<table class="table table-sm table-hover" id="prairietrack-table">
			</table>
		`;

		return div;
	}

	// Helper function to set table content based on state
	function setTableContent(isError = false) {
		const table = document.getElementById('prairietrack-table');
		if (!table) return;

		const tableBody = isError
			? `<thead>
				<tbody>
					<td>
						<span>There was an error loading PrairieTrack. This may happen after the userscript updates or when local storage is corrupted. Please click <b>Reload</b> to resolve this issue.</span>
					</td>
				</tbody>`
			: `<thead>
					<tr>
						<th colspan="${isAssessmentsPage ? 2 : 3}">
							All Upcoming Assessments
						</th>
						<th class="text-center">Due Time</th>
						<th class="text-center">Score</th>
					</tr>
				</thead>
				<tbody></tbody>`;

		table.innerHTML = tableBody;
	}

	// Centralized function to process a course document and extract formatted assessment rows
	function processCourse(doc, courseUrl) {
		// Extract course code (selector depends on PrairieLearn's DOM structure)
		const courseCode = doc.querySelector("#main-nav > li:first-child")?.innerText.trim().split(",")[0];
		if (!courseCode) {
			return null;
		}

		// Extract assessment rows (selector depends on PrairieLearn's table structure)
		const rowElements = Array.from(doc.querySelectorAll("#content table > tbody > tr:has(td)"));
		if (rowElements.length === 0) {
			return null;
		}

		// Clone and filter rows
		const rows = rowElements.map((row) => row.cloneNode(true));
		const filteredRows = rows.filter((row) => {
			// Filter for incomplete assessments with upcoming due dates
			if (row.children.length < 4) return false;

			const dueColumn = row.children[2];
			const gradeColumn = row.children[3];

			let grade = parseFloat(gradeColumn.innerText);
			return (
				dueColumn.innerHTML.includes("until") &&
				(isNaN(grade) || grade < 100)
			);
		});

		// Format dates and set data-due attribute
		filteredRows.forEach((row) => {
			const due = row.children[2];
			const time = due.innerHTML
				.trim()
				.split(" ")
				.slice(2, 6)
				.join(" ")
				.trim()
				.split(", ");
			[time[0], time[1], time[2]] = [time[1], time[2], time[0]];
			due.setAttribute("data-due", time.join(", "));
			due.innerHTML = due.getAttribute("data-due");

			// Set course metadata on each row
			row.children[0].setAttribute("data-course-code", courseCode);
			row.children[0].setAttribute("data-course-href", courseUrl || location.href.split("?")[0]);
		});

		return {
			courseCode,
			rows: filteredRows
		};
	}

	// Function to fetch and parse assessment data from a course
	async function fetchCourseAssessments(courseUrl, courseInstanceId) {
		try {
			const response = await fetch(courseUrl + '/assessments');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const html = await response.text();
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// Use centralized processing function
			const result = processCourse(doc, courseUrl);
			if (!result) {
				return null;
			}

			return {
				courseInstanceId,
				rows: result.rows.map((row) => row.innerHTML),
				timestamp: Date.now()
			};
		} catch (error) {
			showToast(`Error fetching course ${courseInstanceId}: ${error.message}`, 'error');
			return null;
		}
	}

	async function fetchAndCachePrairieTest() {
		return new Promise((resolve) => {
			showToast('Reloading PrairieTest exams', 'info');
			GM_xmlhttpRequest({
				method: "GET",
				url: "https://us.prairietest.com/",
				onload: function(response) {
					if (response.status !== 200) {
						showToast(`Error loading PrairieTest: ${response.status}`, 'error');
						return resolve();
					}

					const parser = new DOMParser();
					const doc = parser.parseFromString(response.responseText, 'text/html');
					const ptListGroup = doc.querySelector('.card .list-group');

					if (ptListGroup) {
						ptListGroup.querySelectorAll('a').forEach(a => {
							const href = a.getAttribute('href');
							if (href && href.startsWith('/')) {
								a.href = 'https://us.prairietest.com' + href;
							}
							a.setAttribute('target', '_blank');
						});

						window.localStorage.setItem('prairieTrack-tests', JSON.stringify({
							html: ptListGroup.outerHTML,
							timestamp: Date.now()
						}));
					}
					resolve();
				},
				onerror: (e) => {
					showToast(`Error loading PrairieTest: ${e}`, 'error');
					resolve();
				}
			});
		});
	}

	// Reload function using fetch instead of window.open
	const reload = async function() {
		// Clear old data
		Object.keys(window.localStorage).forEach(key =>
			key.startsWith('prairieTrack-') ? window.localStorage.removeItem(key) : null
		);

		const courses = document.querySelectorAll(`a[href^='/pl/course_instance/']:not([href$='/'])`);
		if (courses.length === 0) {
			showToast('No courses found to reload', 'error');
			return;
		}

		showToast(`Reloading ${courses.length} course(s)...`, 'info');

		const promises = Array.from(courses).map(async (a) => {
			const courseUrl = a.href;
			// Extract courseInstanceId from URL pathname (format: /pl/course_instance/XXXXX)
			const urlPath = new URL(courseUrl).pathname;
			const courseInstanceId = urlPath.split('/')[3]; // Gets XXXXX from /pl/course_instance/XXXXX
			const data = await fetchCourseAssessments(courseUrl, courseInstanceId);

			if (data && data.rows.length > 0) {
				const key = `prairieTrack-${courseInstanceId}`;
				window.localStorage.setItem(key, JSON.stringify(data));
			}
		});

		try {
			await Promise.all([...promises, fetchAndCachePrairieTest()]);
			showToast('Reloaded successfully!', 'success');
			setTimeout(() => location.reload(), RELOAD_DELAY_MS);
		} catch (error) {
			showToast(`Error reloading: ${error.message}`, 'error');
		}
	};

	// Create card structure once (same for both success and error states)
	const div = createCardStructure();

	if (isPrairieLearnPage) {
		document.getElementById('prairietrack-reload-btn')?.addEventListener('click', reload);
	}

	try {
		/** @type Element[] */
		let rows = [];

		if (isAssessmentsPage) {
			// Use centralized processing function
			const result = processCourse(document);
			if (result) rows = result.rows;
		} else if (isPrairieLearnPage) {
			// Check for stale data and auto-refetch
			const keys = Object.keys(window.localStorage).filter((key) =>
				key.startsWith("prairieTrack-")
			);

			let hasStaleData = false;
			keys.forEach((key) => {
				try {
					const data = JSON.parse(window.localStorage.getItem(key));
					if (isDataStale(data.timestamp)) hasStaleData = true;

					data.rows?.forEach((row) => {
						const tr = document.createElement("tr");
						tr.innerHTML = row;
						rows.push(tr);
					});

					// for prairietest (not a table)
					if (data.html) div.insertAdjacentHTML('beforeend', data.html);
				} catch (e) {
					showToast(`Error loading stored data: ${e.message}`, 'error');
				}
			});

			if (hasStaleData) reload();
		}

		// Set table content for success state
		setTableContent(false);

		function dueToDate(dueString) {
			const time = dueString.split(", ");
			return new Date(`${new Date().getFullYear()} ${time[1]} ${time[2]}`);
		}
		// sort by date
		rows = rows.sort((a, b) => {
			const aDate = dueToDate(a.children[2].innerHTML);
			const bDate = dueToDate(b.children[2].innerHTML);
			return aDate - bDate;
		});
		// update local storage
		if (isAssessmentsPage) {
			const key = `prairieTrack-${location.pathname.split("/")[3]}`;
			window.localStorage.setItem(
				key,
				JSON.stringify({
					rows: rows.map((row) => row.innerHTML),
					timestamp: Date.now()
				})
			);
		}
		// append rows
		rows.forEach((row) => {
			// add course code
			if (isPrairieLearnPage) {
				const td = document.createElement("td");
				const anchor = document.createElement("a");
				anchor.innerHTML = row.children[0]
					.getAttribute("data-course-code")
					.replace(" ", "&nbsp;");
				anchor.href = row.children[0].getAttribute("data-course-href");
				td.appendChild(anchor);
				td.style.width = "1%";
				row.insertBefore(td, row.children[0]);
			}
			div.getElementsByTagName("tbody")[0].appendChild(row);

			// Add hover event listeners for time remaining display
			// On main page, due date is in column 3 (after course code column)
			// On assessment page, due date is in column 2
			const dueColumnIndex = isPrairieLearnPage ? 3 : 2;
			const due = row.children[dueColumnIndex];
			if (due && due.hasAttribute('data-due')) {
				due.addEventListener('mouseenter', function() {
					// Show time remaining inline
					const dueString = this.getAttribute('data-due');
					const time = getTimeRemaining(dueToDateFromString(dueString));
					this.innerHTML = time.days + 'd ' + time.hours + 'h ' + time.minutes + 'm remain';
				});
				due.addEventListener('mouseleave', function() {
					// Restore due date inline
					this.innerHTML = this.getAttribute('data-due');
				});
			}
		});
	} catch (e) {
		showToast(`Error loading PrairieTrack: ${e.message}`, 'error');
		// Set table content for error state
		setTableContent(true);
	}
})();
