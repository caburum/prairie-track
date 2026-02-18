// ==UserScript==
// @name         PrairieTrack
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
  const RELOAD_DELAY_MS = 500; // Delay before reloading page after successful fetch
  
  // Toast notification helper using Bootstrap toasts
  function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('prairietrack-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'prairietrack-toast-container';
      toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
      toastContainer.style.zIndex = '9999';
      document.body.appendChild(toastContainer);
    }
    
    // Determine toast class and icon based on type
    const typeConfig = {
      'success': { bg: 'bg-success', icon: 'bi-check-circle-fill' },
      'error': { bg: 'bg-danger', icon: 'bi-x-circle-fill' },
      'info': { bg: 'bg-primary', icon: 'bi-info-circle-fill' }
    };
    const config = typeConfig[type] || typeConfig['info'];
    
    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toastHtml = `
      <div id="${toastId}" class="toast align-items-center text-white ${config.bg} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">
            <i class="bi ${config.icon} me-2"></i>${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;
    
    // Insert toast into container
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // Initialize and show Bootstrap toast
    const toastElement = document.getElementById(toastId);
    const bsToast = new bootstrap.Toast(toastElement, { autohide: true, delay: 4000 });
    bsToast.show();
    
    // Remove toast element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.remove();
    });
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
      
      // Extract course code (selector depends on PrairieLearn's DOM structure)
      const courseCode = doc.querySelector("#main-nav > li:first-child")?.innerText.trim().split(",")[0];
      if (!courseCode) {
        console.warn(`Could not extract course code from ${courseUrl}`);
        return null;
      }
      
      // Extract assessment rows (selector depends on PrairieLearn's table structure)
      const rowElements = Array.from(doc.querySelectorAll("#content table > tbody > tr:has(td)"));
      if (rowElements.length === 0) {
        console.warn(`No assessment rows found for ${courseUrl}`);
        return null;
      }
      
      const rows = rowElements.map((row) => row.cloneNode(true));
      const filteredRows = rows.filter((row) => {
        // Filter for incomplete assessments with upcoming due dates
        // Note: This depends on PrairieLearn's column order and content format
        if (row.children.length < 4) return false;
        
        const dueColumn = row.children[2];
        const gradeColumn = row.children[3];
        
        let grade = parseFloat(gradeColumn.innerText);
        return (
          dueColumn.innerHTML.includes("until") &&
          (isNaN(grade) || grade < 100)
        );
      });
      
      // Add course metadata to rows
      filteredRows.forEach((row) => {
        if (row.children.length > 0) {
          row.children[0].setAttribute("data-course-code", courseCode);
          row.children[0].setAttribute("data-course-href", courseUrl);
        }
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
    
    const courses = document.querySelectorAll(`a[href^='/pl/course_instance/']:not([href$='/'])`);
    if (courses.length === 0) {
      showToast('No courses found to reload', 'error');
      return;
    }
    
    showToast(`Reloading ${courses.length} course(s)...`, 'info');
    
    const promises = Array.from(courses).map(async (a) => {
      const courseUrl = a.href;
      const courseInstanceId = courseUrl.split('/')[4];
      const data = await fetchCourseAssessments(courseUrl, courseInstanceId);
      
      if (data && data.rows.length > 0) {
        const key = `prairieTrack-${courseInstanceId}`;
        window.localStorage.setItem(key, JSON.stringify(data));
      }
    });
    
    try {
      await Promise.all(promises);
      showToast('Assessments reloaded successfully!', 'success');
      setTimeout(() => location.reload(), RELOAD_DELAY_MS);
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
          setTimeout(() => reloadRows(), RELOAD_DELAY_MS);
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
      <div class="card-header bg-primary text-white d-flex align-items-center">PrairieTrack
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
      <div class="card-header bg-primary text-white d-flex align-items-center">PrairieTrack
        <button type="button" class="btn btn-light btn-sm ms-auto ${
          isPrairieLearnPage ? "" : "d-none"
        }" id="prairietrack-reload-btn-error">
          <i class="bi bi-arrow-repeat me-sm-1" aria-hidden="true"></i>
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
