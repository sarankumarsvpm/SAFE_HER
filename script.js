
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
    
// SAFEHER LIVE LOCATION

function getLiveLocation() {
    const status = document.getElementById("locationStatus");
    const mapLink = document.getElementById("mapLink");

    if (!navigator.geolocation) {
        status.textContent = "Location is not supported by this browser.";
        return;
    }

    status.textContent = "Detecting your location...";

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            status.textContent = "Your location detected successfully!";

            mapLink.href =
                "https://www.google.com/maps?q=" +
                latitude + "," + longitude;

            mapLink.style.display = "inline-block";
        },

        function(error) {
            status.textContent =
                "Location unavailable. Please allow location permission.";
        }
    );
}


    if (confirmSOS) {
        alert("SafeHer demo: Please contact emergency services directly if you need urgent help.");
    }
}
