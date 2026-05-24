//*********Readme.js file starts here***********// 

//Function to open the help dialog
function openHelpDialog() {
    const helpDialog = document.createElement('div');
    helpDialog.className = 'help';
    helpDialog.innerHTML = `
        <div class="help-content">
    <fieldset>
        <legend style="font-weight: bold; text-decoration: underline; color: #007BFF; font-size: 14px;">User Manual: Commands for use of Radar Simulator</legend>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left; text-decoration: underline;">Commands</th>
                    <th style="border: 1px solid #ccc; padding: 8px; text-align: left; text-decoration: underline;">Description</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">RH</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">Report Heading</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">R090 or L090</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">Turn Right or Left Heading 090</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">H20</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">To climb or descend to 2000 ft</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">V4000</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">To set the rate of climb/descend to 4000 ft per minute</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">S600</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">To set the speed to 600 knots</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">Del</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">To delete the aircraft</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">SSR1000</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">Set the squawk code to 1000</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">ST</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">To make the aircraft stop turning i.e. Wings level</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">OL/OR</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">To make the aircraft Orbit Left or Right</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ccc; padding: 8px;">Formation Handling</td>
                    <td style="border: 1px solid #ccc; padding: 8px;">Un-Check / Check on checkbox adjacent to Formation Leader Command Input Box in Aircraft Control Panel to Split/Join the Formation.</td>
                </tr>
            </tbody>
        </table>
        <button id="closeHelpButton" class="control-button">Close</button>
    </fieldset>
</div>

    `;

    // Append the dialog to the body
    document.body.appendChild(helpDialog);

    // Close button event listener
    const closeHelpButton = helpDialog.querySelector('#closeHelpButton');
    closeHelpButton.addEventListener('click', function () {
        document.body.removeChild(helpDialog);
    });

    // Escape key event listener
    function closeDialogOnEscape(event) {
        if (event.key === 'Escape') {
            // Check if helpDialog is still a child of the document body
            if (document.body.contains(helpDialog)) {
                document.body.removeChild(helpDialog);
            }
        }
    }

    // Add the escape key listener
    document.addEventListener('keydown', closeDialogOnEscape);
}

// Event listener for help button
document.getElementById('helpButton').addEventListener('click', openHelpDialog);



//*************Readme.js file ends here ************/