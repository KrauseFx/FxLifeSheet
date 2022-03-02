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
                if (!row.key.startsWith('rescue_time') && !row.key.startsWith('Swarm')) {
                    const opt = document.createElement('option');
                    opt.value = row.key;
                    opt.innerHTML = `${row.key} (${row.count})`;
                    selects[i].appendChild(opt);
                }
            });
        }
        callback(keys);
    });
}

function renderPie(key) {
    getPieData(key, "All", (data) => {
        values = []
        labels = []

        for (var i = 0; i < data.year.length; i++) {
            let currentRow = data.year[i]
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
            Plotly.toImage(gd, { height: 600, width: 1000, format: "svg" }).then(function(base64) {
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
                renderPieHistoryChart(yearsData, key, false, "pieGraphHistory");
                renderPieHistoryChart(yearsData, key, true, "pieGraphHistoryMonths");
            }
        })
    }
}

function renderPieHistoryChart(yearsData, key, groupByMonth, nodeId) {
    let minimumValueToRender = 26;

    console.log(yearsData);
    let traces = {}
    let totalPerYear = {}

    minimumValueToRender = parseInt(document.getElementById("min-entries").value);

    for (const year in yearsData) {
        if (groupByMonth) {
            let monthsData = yearsData[year].months;
            for (const m in monthsData) {
                let monthDetails = monthsData[m];
                for (const i in monthDetails) {
                    let currentRow = monthDetails[i];
                    if (currentRow.count > minimumValueToRender) { // to not pollute the graph with small values
                        if (!traces[currentRow.value]) { traces[currentRow.value] = {} }

                        const key = year + "-" + m
                        traces[currentRow.value][key] = currentRow.count

                        if (!totalPerYear[key]) { totalPerYear[key] = 0 }
                        totalPerYear[key] += currentRow.count
                    }
                }
            }
        } else {
            let yearData = yearsData[year].year;
            for (const i in yearData) {
                let currentRow = yearData[i];
                if (currentRow.count > minimumValueToRender) { // to not pollute the graph with small values
                    if (!traces[currentRow.value]) { traces[currentRow.value] = {} }
                    traces[currentRow.value][year] = currentRow.count

                    if (!totalPerYear[year]) { totalPerYear[year] = 0 }
                    totalPerYear[year] += currentRow.count
                }
            }
        }
    }

    var data = []
    for (let i in traces) {
        let value = traces[i]
        let yValues = []
        for (const key in totalPerYear) {
            const total = (totalPerYear[key] || 0).toFixed(2);
            yValues.push(value[key] / total * 100)
        }
        data.push({
            x: Object.keys(totalPerYear),
            y: yValues,
            name: i,
            type: 'bar',
            textposition: 'inside',
            text: i,
        })

    }
    var layout = {
        xaxis: groupByMonth ? {
            title: '',
            dtick: 'auto',
            ticklabelstep: 'auto',
            tickangle: 90,
            nticks: 42,
            dtick: 'M1',
            tickprefix: '  ' // for some padding
        } : {
            title: 'Year',
            dtick: 1
        },
        yaxis: {
            title: '',
            ticksuffix: "%",
            showTickSuffix: 'all',
            showticksuffix: 'all',
        },
        barmode: 'relative',
        title: key,
        colorway: ["#AA0DFE", "#3283FE", "#85660D", "#782AB6", "#565656", "#1C8356", "#16FF32", "#F7E1A0", "#E2E2E2", "#1CBE4F", "#C4451C", "#DEA0FD", "#FE00FA", "#325A9B", "#FEAF16", "#F8A19F", "#90AD1C", "#F6222E", "#1CFFCE", "#2ED9FF", "#B10DA1", "#C075A6", "#FC1CBF", "#B00068", "#FBE426", "#FA0087"]
    };
    var config = {
        showLink: true,
        plotlyServerURL: "https://chart-studio.plotly.com",
        linkText: 'Customize'
    };
    Plotly.newPlot(nodeId, data, layout, config).then(function(gd) {
        Plotly.toImage(gd, { height: 650, width: 1000, format: "svg" }).then(function(base64) {
            document.getElementById('svg-export-' + nodeId).setAttribute("src", base64);
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