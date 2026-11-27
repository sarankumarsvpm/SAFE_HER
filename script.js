
function planJourney() {
    const start = document.getElementById("start").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const result = document.getElementById("result");

    if (start === "" || destination === "") {
        result.innerHTML = "Please enter both locations.";
        return;
    }

    result.innerHTML = `
        <h3>Journey Details</h3>
        <p>Starting Point: ${start}</p>
        <p>Destination: ${destination}</p>
        <p>Your journey details are ready!</p>
        <p>Next, connect a mapping service to find your route.</p>
    `;
}

function emergencyAlert() {
    const confirmSOS = confirm(
        "This is a demonstration. No emergency message will be sent. Continue?"
    );

    if (confirmSOS) {
        alert("SafeHer demo: Please contact emergency services directly if you need urgent help.");
    }
}
