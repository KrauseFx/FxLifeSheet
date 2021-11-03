const host = 'http://127.0.0.1:8080';
let keys = [];

function loadKeys(callback) {
    httpGetAsync(`${host}/keys`, (data) => {
        keys = data;
        selects = document.getElementsByClassName('keys');
        for (let i = 0; i < selects.length; i++) {
            data.forEach((row) => {
                const opt = document.createElement('option');
                opt.value = row.key;
                opt.innerHTML = `${row.key} (${row.count})`;
                selects[i].appendChild(opt);
            });
        }
        callback(keys);
    });
}

function getGitHubData(key) {
    httpGetAsync(`${host}/github_style?key=${key}&start_date=2021-01`, (data) => {
        var x = [];
        var y = [];
        data = Object.values(data);
        console.log(data)
        for (var i = 0; i < data.length; i++) {
            let currentRow = data[i]
            if (!!currentRow.value) {
                let value = parseInt(currentRow.value)
                while (value > 0) {
                    value--;
                    x.push(currentRow.matchedWeekOfTheYear)
                    y.push(currentRow.matchedDayOfWeek)
                }

                // Add one entry, just for it not being nil
                x.push(currentRow.matchedWeekOfTheYear)
                y.push(currentRow.matchedDayOfWeek)
            } else {
                console.log("TODO: Add support for nil values...");
            }
        }
        console.log(x)
        console.log(y)
        let allData = [{
            x: x,
            y: y,
            type: 'histogram2d',
            histnorm: "count",
            autobinx: false,
            xbins: {
                start: 1,
                end: 52,
                size: 1
            },
            autobiny: false,
            ybins: {
                start: 0,
                end: 7,
                size: 1
            },
            colorscale: [
                ['0', 'rgba(0, 0, 0, 0)'],
                ['0.5', 'rgba(150, 255, 150, 0.7)'],
                ['1', 'rgb(37, 200, 37)'],
            ]
        }];

        var layout = {
            title: key,
            yaxis: {
                tickvals: ["6", "5", "4", "3", "2", "1", "0"],
                ticktext: ['Monday<br /><br />', '', 'Wednesday<br /><br />', '', 'Friday<br /><br />', '', 'Sunday<br /><br />', ''],
            },
        }
        var config = {
            showLink: true,
            plotlyServerURL: "https://chart-studio.plotly.com",
            linkText: 'Customize'
        };

        Plotly.newPlot('myGitHubGraph', allData, layout, config);
    })
}

function updateKeyForIndex(key) {
    document.getElementById(`keys-0`).value = key;
    getGitHubData(key)
}

function reloadIndex() {
    getGitHubData(document.getElementById(`keys-0`).value)
}

function httpGetAsync(theUrl, callback) {
    const xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
            callback(JSON.parse(xmlHttp.responseText));
        }
    };
    xmlHttp.open('GET', theUrl, true);
    xmlHttp.send(null);
}

loadKeys(() => {
    updateKeyForIndex('gym');
});