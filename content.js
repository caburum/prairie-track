(() => {
  try {
    let rows = Array.from(
      document.querySelectorAll("#content > div > table > tbody > tr:has(td)")
    );

    rows = rows.map((row) => row.cloneNode(true));

    rows = rows.filter((row) => row.children[2].innerHTML.includes("until"));

    const div = document.createElement("div");
    div.classList.add("card", "mb-4");
    const content = document.getElementById("content");
    content.insertBefore(div, content.firstChild);
    div.innerHTML = /* html */ `
      <div class="card-header bg-primary text-white">PrairieTrack<small style="opacity: 50%"> by Anthony Du</small></div>
        <table class="table table-sm table-hover">
          <thead>
            <tr>
              <th colspan="2" data-testid="assessment-group-heading">
                All Upcoming Assessments
              </th>
              <th class="text-center">Due Time</th>
              <th class="text-center">Score</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;
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
      due.innerHTML = time.join(", ");
    });
    rows = rows.sort((a, b) => {
      const aTime = a.children[2].innerHTML.split(", ");
      const aDate = new Date(
        `${new Date().getFullYear()} ${aTime[1]} ${aTime[2]}`
      );
      console.log(`${new Date().getFullYear()} ${aTime[1]} ${aTime[2]}`);
      const bTime = b.children[2].innerHTML.split(", ");
      const bDate = new Date(
        `${new Date().getFullYear()} ${bTime[1]} ${bTime[2]}`
      );
      return aDate - bDate;
    });
    rows.forEach((row) => {
      div.getElementsByTagName("tbody")[0].innerHTML += row.outerHTML;
    });
  } catch (e) {
    console.log(e);
  }
})();
