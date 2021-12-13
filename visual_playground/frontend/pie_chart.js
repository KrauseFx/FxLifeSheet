const host = 'http://127.0.0.1:8080';
let keys = [];
let yearsData = {}
const allYearsToUse = [2016, 2017, 2018, 2019, 2020, 2021];

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

function renderPie(key) {
    getPieData(key, "All", (data) => {
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
            title: `${key}`
        }
        var config = {
            showLink: true,
            plotlyServerURL: "https://chart-studio.plotly.com",
            linkText: 'Customize'
        };

        Plotly.newPlot(`pieGraphAll`, allData, layout, config).then(function(gd) {
            Plotly.toImage(gd, { height: 900, width: 1000, format: "svg" }).then(function(base64) {
                console.log(base64)
                document.getElementById('svg-export-1').setAttribute("src", base64);
            })
        });
    });
}

function renderPieHistory(key) {
    yearsData = {};
    for (const index in allYearsToUse) {
        const year = allYearsToUse[index];
        getPieData(key, year, function(data) {
            yearsData[year] = data;
            if (Object.keys(yearsData).length == allYearsToUse.length) {
                renderPieHistoryChart(yearsData, key);
            }
        })
    }
}

function renderPieHistoryChart(yearsData, key) {
    console.log(yearsData);
    let traces = {}
    for (const year in yearsData) {
        let yearData = yearsData[year];
        for (const i in yearData) {
            let currentRow = yearData[i];
            if (!traces[currentRow.value]) { traces[currentRow.value] = {} }
            traces[currentRow.value][year] = currentRow.count
        }
    }

    var data = []
    for (let i in traces) {
        let value = traces[i]
        let yValues = []
        for (const year in allYearsToUse) {
            yValues.push(value[allYearsToUse[year]])
        }
        data.push({
            x: allYearsToUse,
            y: yValues,
            name: i,
            type: 'bar'
        })
    }
    var layout = {
        xaxis: { title: 'X axis' },
        yaxis: { title: 'Y axis' },
        barmode: 'relative',
        title: key
    };
    Plotly.newPlot('pieGraphHistory', data, layout).then(function(gd) {
        Plotly.toImage(gd, { height: 900, width: 1000, format: "svg" }).then(function(base64) {
            console.log(base64)
            document.getElementById('svg-export-2').setAttribute("src", base64);
        })
    });
}

function getPieData(key, year, callback) {
    let url;
    if (year == "All") {
        url = `${host}/pie_data?key=${key}`
    } else {
        url = `${host}/pie_data?key=${key}&start_date=${year}-01&end_date=${year + 1}-01`
    }
    httpGetAsync(url, (data) => {
        data = Object.values(data);
        console.log(data)
        callback(data)
    })
}

function updateKeyForIndex(key) {
    document.getElementById(`keys-0`).value = key;
    reloadIndex();
}

function reloadIndex() {
    renderPie(document.getElementById(`keys-0`).value);
    renderPieHistory(document.getElementById(`keys-0`).value);
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