// CONFIGURATION
const API_URL = 'http://localhost:5000/api'; // Adjust port if needed
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NzQzMjZhMWRmMTViN2M2NmFjZTllNyIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImlhdCI6MTc3MTMxNDUzOCwiZXhwIjoxNzcxMzQzMzM4fQ.NrHMHtVKGNmhsWozHAa_Tg4FjcZjhtw95Qczlc2lx_Q'; // <--- IMPORTANT: Paste a valid Admin Token here

// COLORS FOR CONSOLE
const red = '\x1b[31m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTest() {
    console.log(`${yellow}--- STARTING MAINTENANCE MODE TEST ---${reset}\n`);

    // 1. CHECK HEALTH (Should always be 200)
    console.log(`1. Testing /health endpoint...`);
    try {
        const healthRes = await fetch(`http://localhost:5000/health`);
        if (healthRes.status === 200) console.log(`${green}✔ Health check passed (200 OK)${reset}`);
        else console.log(`${red}✘ Health check failed (${healthRes.status})${reset}`);
    } catch (e) {
        console.log(`${red}✘ Server seems down: ${e.message}${reset}`);
        return;
    }

    // 2. TURN ON MAINTENANCE MODE
    console.log(`\n2. Turning ON Maintenance Mode...`);
    const toggleOn = await fetch(`${API_URL}/admin/settings`, {
        method: 'PATCH',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({ "system.maintenanceMode": true })
    });
    
    if (toggleOn.status === 200) {
        console.log(`${green}✔ System locked successfully.${reset}`);
    } else {
        console.log(`${red}✘ Failed to lock system. Check Admin Token.${reset}`);
        return;
    }

    // 3. SIMULATE REGULAR USER ACCESS (Should get 503)
    console.log(`\n3. Simulating User Access to /api/tasks...`);
    const userRes = await fetch(`${API_URL}/tasks`); // No token = Public/User
    if (userRes.status === 503) {
        console.log(`${green}✔ Middleware WORKING: User blocked (503 Service Unavailable)${reset}`);
    } else {
        console.log(`${red}✘ Middleware FAILED: User accessed site (${userRes.status})${reset}`);
    }

    // 4. CHECK HEALTH AGAIN (Should still be 200)
    console.log(`\n4. Verifying /health is still accessible...`);
    const healthResLocked = await fetch(`http://localhost:5000/health`);
    if (healthResLocked.status === 200) {
        console.log(`${green}✔ Health check passed (200 OK)${reset}`);
    } else {
        console.log(`${red}✘ Health check blocked! It should be exempt.${reset}`);
    }

    // 5. TURN OFF MAINTENANCE MODE
    console.log(`\n5. Turning OFF Maintenance Mode...`);
    const toggleOff = await fetch(`${API_URL}/admin/settings`, {
        method: 'PATCH',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ADMIN_TOKEN}`
        },
        body: JSON.stringify({ "system.maintenanceMode": false })
    });

    if (toggleOff.status === 200) {
        console.log(`${green}✔ System unlocked successfully.${reset}`);
    }

    // 6. FINAL USER CHECK (Should be 200 or 401, NOT 503)
    console.log(`\n6. Verifying User Access restored...`);
    const finalRes = await fetch(`${API_URL}/tasks`);
    if (finalRes.status !== 503) {
        console.log(`${green}✔ Access Restored: Response was ${finalRes.status} (Not 503)${reset}`);
    } else {
        console.log(`${red}✘ Failed: User still blocked.${reset}`);
    }

    console.log(`\n${yellow}--- TEST COMPLETE ---${reset}`);
}

runTest();