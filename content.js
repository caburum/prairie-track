// ==UserScript==
// @name         PrairieTrack - PrairieLearn Tracker
// @namespace    https://github.com/caburum/prairie-track
// @version      0.5.0
// @description  Keep track of PrairieLearn and PrairieTest!
// @author       Anthony Du
// @match        *://*.prairielearn.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
  "use strict";
  
  // Configuration
  const STALE_TIME_MS = 3 * 60 * 60 * 1000; // 3 hours
  
  // Toast notification helper
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 15px 20px;
      background-color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
      color: white;
      border-radius: 5px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  
  // Check if data is stale
  function isDataStale(timestamp) {
    if (!timestamp) return true;
    return Date.now() - timestamp > STALE_TIME_MS;
  }
  
  const isAssessmentsPage = location.pathname.endsWith("assessments");
  const isPrairieLearnPage = location.pathname === "/" || location.pathname.endsWith("pl");
  if (!isAssessmentsPage && !isPrairieLearnPage) {
    return;
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
      
      // Extract course code
      const courseCode = doc.querySelector("#main-nav > li:first-child")?.innerText.trim().split(",")[0];
      if (!courseCode) return null;
      
      // Extract assessment rows
      const rowElements = Array.from(doc.querySelectorAll("#content table > tbody > tr:has(td)"));
      const rows = rowElements.map((row) => row.cloneNode(true));
      const filteredRows = rows.filter((row) => {
        let grade = parseFloat(row.children[3].innerText);
        return (
          row.children[2].innerHTML.includes("until") &&
          (isNaN(grade) || grade < 100)
        );
      });
      
      // Add course metadata to rows
      filteredRows.forEach((row) => {
        row.children[0].setAttribute("data-course-code", courseCode);
        row.children[0].setAttribute("data-course-href", courseUrl);
      });
      
      return {
        courseInstanceId,
        rows: filteredRows.map((row) => row.innerHTML),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Error fetching assessments for ${courseUrl}:`, error);
      return null;
    }
  }
  
  // Reload function using fetch instead of window.open
  const reloadRows = async function() {
    // Clear old data
    Object.keys(window.localStorage).forEach(key =>
      key.startsWith('prairieTrack-') ? window.localStorage.removeItem(key) : null
    );
    
    const courses = document.querySelectorAll(\`a[href^='/pl/course_instance/']:not([href$='/'])\`);
    if (courses.length === 0) {
      showToast('No courses found to reload', 'error');
      return;
    }
    
    showToast(\`Reloading \${courses.length} course(s)...\`, 'info');
    
    const promises = Array.from(courses).map(async (a) => {
      const courseUrl = a.href;
      const courseInstanceId = courseUrl.split('/')[4];
      const data = await fetchCourseAssessments(courseUrl, courseInstanceId);
      
      if (data && data.rows.length > 0) {
        const key = \`prairieTrack-\${courseInstanceId}\`;
        window.localStorage.setItem(key, JSON.stringify(data));
      }
    });
    
    try {
      await Promise.all(promises);
      showToast('Assessments reloaded successfully!', 'success');
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      console.error('Error reloading assessments:', error);
      showToast('Error reloading assessments', 'error');
    }
  };
  try {
    /** @type Element[] */
    let rows = [];
    let courseCode = "";
    let courseHref = "";
    if (isAssessmentsPage) {
      courseCode = document
        .querySelector("#main-nav > li:first-child")
        .innerText.trim().split(",")[0];
      courseHref = location.href.split("?")[0];
      rows = Array.from(
        document.querySelectorAll("#content table > tbody > tr:has(td)")
      );
      rows = rows.map((row) => row.cloneNode(true));
      rows = rows.filter((row) => {
        let grade = parseFloat(row.children[3].innerText);
        return (
          row.children[2].innerHTML.includes("until") &&
					// !row.children[3].innerHTML === "New instance" &&
          (isNaN(grade) || grade < 100)
        );
      });
    } else if (isPrairieLearnPage) {
      // Check for stale data and auto-refetch
      const keys = Object.keys(window.localStorage).filter((key) =>
        key.startsWith("prairieTrack-")
      );
      
      let hasStaleData = false;
      if (keys.length > 0) {
        // Check if any data is stale
        for (const key of keys) {
          try {
            const data = JSON.parse(window.localStorage.getItem(key));
            if (isDataStale(data.timestamp)) {
              hasStaleData = true;
              break;
            }
          } catch (e) {
            hasStaleData = true;
            break;
          }
        }
        
        // Auto-refetch if data is stale
        if (hasStaleData) {
          showToast('Assessment data is stale, refreshing...', 'info');
          // Wait a bit before reloading to ensure UI is ready
          setTimeout(() => reloadRows(), 500);
        }
      }
      
      console.log(keys);
      keys.forEach((key) => {
        try {
          const data = JSON.parse(window.localStorage.getItem(key));
          // Handle both old format (array) and new format (object with timestamp)
          const rowsData = Array.isArray(data) ? data : (data.rows || []);
          rowsData.forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = row;
            rows.push(tr);
          });
        } catch (e) {
          console.error(`Error parsing localStorage key ${key}:`, e);
        }
      });
      console.log(rows);
    }
    // create div
    const div = document.createElement("div");
    div.classList.add("card", "mb-4");
    const parent = document.getElementById("content");
    parent.insertBefore(div, parent.firstChild);
    div.innerHTML = /* html */ `
      <div class="card-header bg-primary text-white d-flex align-items-center">PrairieTrack<sup>beta</sup><small style="opacity: 50%">&nbsp;by Anthony Du</small>
        <button type="button" class="btn btn-light btn-sm ms-auto ${
          isPrairieLearnPage ? "" : "d-none"
        }" id="prairietrack-reload-btn">
          <i class="bi bi-arrow-repeat me-sm-1" aria-hidden="true"></i>
          <span class="d-none d-sm-inline">Reload</span>
        </button>
      </div>
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th colspan="${
              isAssessmentsPage ? 2 : 3
            }">
              All Upcoming Assessments
            </th>
            <th class="text-center">Due Time</th>
            <th class="text-center">Score</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    
    // Attach event listener to reload button
    if (isPrairieLearnPage) {
      const reloadBtn = document.getElementById('prairietrack-reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', reloadRows);
      }
    }
    const timeRemaining = /* js */ `
      // https://gist.github.com/alirezas/4b4488d6f9eced7b65ca9c5f73a52230
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
      function dueToDate(dueString) {
        const time = dueString.split(", ");
        return new Date(new Date().getFullYear() + ' ' + time[1] + ' ' + time[2]);
      }
      const time = getTimeRemaining(dueToDate(this.getAttribute('data-due')));
      this.innerHTML = time.days + 'd ' + time.hours + 'h ' + time.minutes + 'm remain';
    `;
    // format date
    if (isAssessmentsPage) {
      rows.forEach((row) => {
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
        due.setAttribute("onmouseenter", timeRemaining);
        due.setAttribute(
          "onmouseleave",
          "this.innerHTML = this.getAttribute('data-due')"
        );
      });
    }
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
      rows.forEach((row) => {
        row.children[0].setAttribute("data-course-code", courseCode);
        row.children[0].setAttribute("data-course-href", courseHref);
      });
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
    });
  } catch (e) {
    console.log(e);
    const div = document.createElement("div");
    div.classList.add("card", "mb-4");
    const parent = document.getElementById("content");
    parent.insertBefore(div, parent.firstChild);
    div.innerHTML = /* html */ `
      <div class="card-header bg-primary text-white d-flex align-items-center">PrairieTrack<sup>beta</sup><small style="opacity: 50%">&nbsp;by Anthony Du</small>
        <button type="button" class="btn btn-light btn-sm ms-auto ${
          isPrairieLearnPage ? "" : "d-none"
        }" id="prairietrack-reload-btn-error">
          <svg class="svg-inline--fa" fill="#000000" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 487.23 487.23"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <g> <path d="M55.323,203.641c15.664,0,29.813-9.405,35.872-23.854c25.017-59.604,83.842-101.61,152.42-101.61 c37.797,0,72.449,12.955,100.23,34.442l-21.775,3.371c-7.438,1.153-13.224,7.054-14.232,14.512 c-1.01,7.454,3.008,14.686,9.867,17.768l119.746,53.872c5.249,2.357,11.33,1.904,16.168-1.205 c4.83-3.114,7.764-8.458,7.796-14.208l0.621-131.943c0.042-7.506-4.851-14.144-12.024-16.332 c-7.185-2.188-14.947,0.589-19.104,6.837l-16.505,24.805C370.398,26.778,310.1,0,243.615,0C142.806,0,56.133,61.562,19.167,149.06 c-5.134,12.128-3.84,26.015,3.429,36.987C29.865,197.023,42.152,203.641,55.323,203.641z"></path> <path d="M464.635,301.184c-7.27-10.977-19.558-17.594-32.728-17.594c-15.664,0-29.813,9.405-35.872,23.854 c-25.018,59.604-83.843,101.61-152.42,101.61c-37.798,0-72.45-12.955-100.232-34.442l21.776-3.369 c7.437-1.153,13.223-7.055,14.233-14.514c1.009-7.453-3.008-14.686-9.867-17.768L49.779,285.089 c-5.25-2.356-11.33-1.905-16.169,1.205c-4.829,3.114-7.764,8.458-7.795,14.207l-0.622,131.943 c-0.042,7.506,4.85,14.144,12.024,16.332c7.185,2.188,14.948-0.59,19.104-6.839l16.505-24.805 c44.004,43.32,104.303,70.098,170.788,70.098c100.811,0,187.481-61.561,224.446-149.059 C473.197,326.043,471.903,312.157,464.635,301.184z"></path></g></g></g></svg>
          <span class="d-none d-sm-inline">Reload</span>
        </button>
      </div>
      <table class="table table-sm table-hover">
        <thead>
        <tbody>
          <td>
            <span>There was an error loading PrairieTrack. This may happen after the userscript updates or when local storage is corrupted. Please click <b>Reload</b> to resolve this issue.</span>
          </td>
        </tbody>
      </table>
    `;
    
    // Attach event listener to reload button in error case
    if (isPrairieLearnPage) {
      const reloadBtn = document.getElementById('prairietrack-reload-btn-error');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', reloadRows);
      }
    }
  }
})();
