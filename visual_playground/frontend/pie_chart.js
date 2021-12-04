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

function getPieData(key, year) {
    httpGetAsync(`${host}/pie_data?key=${key}`, (data) => {
        data = Object.values(data);
        console.log(data)
        values = []
        labels = []

        for (var i = 0; i < data.length; i++) {
            let currentRow = data[i]
            values.push(currentRow.count);
            labels.push(currentRow.value);
        }
        console.log(values)
        console.log(labels)
        let allData = [{
            values: values,
            labels: labels,
            type: 'pie',
            hole: 0.7,
            textposition: 'inside',
            textinfo: "label+percent",
        }];

        var layout = {
            title: `${key} (${year})`,
            height: 900,
            width: 1400
        }
        var config = {
            showLink: true,
            plotlyServerURL: "https://chart-studio.plotly.com",
            linkText: 'Customize'
        };

        Plotly.newPlot(`pieGraph${year}`, allData, layout, config);
    })
}

function updateKeyForIndex(key) {
    document.getElementById(`keys-0`).value = key;
    getPieData(key, 'All')
    setTimeout(function() { getPieData(key, 2020) }, 200);
    setTimeout(function() { getPieData(key, 2019) }, 400);
    // setTimeout(function() { getPieData(key, 2018) }, 600);
    // setTimeout(function() { getPieData(key, 2017) }, 800);
    // setTimeout(function() { getPieData(key, 2016) }, 1000);
    // setTimeout(function() { getPieData(key, 2015) }, 1200);
}

function reloadIndex() {
    getPieData(document.getElementById(`keys-0`).value, 'All');
    setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2021) }, 100);
    setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2020) }, 200);
    // setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2019) }, 400);
    // setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2018) }, 600);
    // setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2017) }, 800);
    // setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2016) }, 1000);
    // setTimeout(function() { getPieData(document.getElementById(`keys-0`).value, 2015) }, 1200);
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
    updateKeyForIndex('swarmCheckinAddressCity');
});