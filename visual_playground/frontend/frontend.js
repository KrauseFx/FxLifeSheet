const host = 'http://127.0.0.1:8080';
let keys = [];
const allData = [];
let groupBy = 'month';
// Multiple axis https://plotly.com/javascript/multiple-axes/
for (const currentIndex of Array(5).keys()) {
    const current = {
        x: [],
        y: [],
        name: `yaxis${currentIndex + 1} data`,
        type: 'scatter',
        line: { shape: 'spline' },
    };
    if (currentIndex > 0) { current.yaxis = `y${currentIndex + 1}`; }
    allData.push(current);
}

const layout = {
    title: 'Life Sheet Data',
    barmode: 'group',
    yaxis: {
        titlefont: { color: '#1f77b4' },
        tickfont: { color: '#1f77b4' },
        showgrid: false,
        zeroline: false,
        showticklabels: true,
    },
    yaxis2: {
        titlefont: { color: '#ff7f0e' },
        tickfont: { color: '#ff7f0e' },
        anchor: 'free',
        overlaying: 'y',
        showgrid: false,
        zeroline: false,
        showticklabels: false,
    },
    yaxis3: {
        titlefont: { color: '#d62728' },
        tickfont: { color: '#d62728' },
        anchor: 'x',
        overlaying: 'y',
        showgrid: false,
        zeroline: false,
        showticklabels: false,
    },
    yaxis4: {
        titlefont: { color: '#9467bd' },
        tickfont: { color: '#9467bd' },
        anchor: 'free',
        overlaying: 'y',
        showgrid: false,
        zeroline: false,
        showticklabels: false,
    },
    yaxis5: {
        anchor: 'free',
        overlaying: 'y',
        showgrid: false,
        zeroline: false,
        showticklabels: false,
    },
};

var config = {
    showLink: true,
    plotlyServerURL: "https://chart-studio.plotly.com",
    linkText: 'Customize'
};
Plotly.newPlot('myGraph', allData, layout, config);

const bucketLayout = {
    title: 'Life Sheet Buckets',
    barmode: 'group',
    yaxis: {
        range: [-1, 1]
    }
}
const allBucketData = [{
    x: [],
    y: [],
    marker: {
        color: '#C8A2C8',
        line: {
            width: 2.5
        }
    },
    type: "bar"
}]
var config = {
    showLink: true,
    plotlyServerURL: "https://chart-studio.plotly.com",
    linkText: 'Customize'
};
Plotly.newPlot('bucketGraph', allBucketData, bucketLayout, config);

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

function updateGraphType() {
    const graphType = document.getElementById('graph-type').value;
    for (let i = 0; i < allData.length; i++) {
        allData[i].type = graphType;
        if (graphType == 'scatter') {
            allData[i].yaxis = allData[i].yaxisBak;
        } else {
            allData[i].yaxisBak = allData[i].yaxis;
            delete allData[i].yaxis;
        }
    }
    Plotly.redraw('myGraph');
}

function updateGroupBy() {
    groupBy = document.getElementById("group-by").value;
    reloadAllData();
}

function updateKeyForIndex(key, index) {
    document.getElementById(`keys-${index}`).value = key;
    reloadIndex(index);
}

function reloadIndex(index) {
    const key = document.getElementById(`keys-${index}`).value;
    const startDate = document.getElementById('start-date');
    const isShown = document.getElementById(`keys-show-${index}`).checked;

    if (isShown) {
        httpGetAsync(`${host}/data?group_by=${groupBy}&key=${key}&start_date=${startDate.value}`, (data) => {
            allData[index].x = data.rows.map((r) => r.as_date);
            if (document.getElementById(`keys-avg-${index}`).checked) {
                allData[index].y = data.rows.map((r) => Math.round(r.avg * 1000) / 1000);
            } else {
                allData[index].y = data.rows.map((r) => Math.round(r.sum * 1000) / 1000);
            }
            allData[index].name = key;

            Plotly.redraw('myGraph');
            console.log(allData);
        });
    } else {
        allData[index].y = [];
        Plotly.redraw('myGraph');
    }
}

let currentBucketData = null;

function updateBucket() {
    bucket = document.getElementById("bucket-key").value
    bucketBorder = document.getElementById('bucketValue').value
    httpGetAsync(`${host}/bucket_options_list?by=${bucket}`, (data) => {
        document.getElementById("max-value").innerHTML = `${data[0].value} (${data[0].count})`;
        document.getElementById("min-value").innerHTML = `${data[data.length - 1].value} (${data[data.length - 1].count})`;
        select = document.getElementById('all-values');
        select.innerHTML = ""
        const opt = document.createElement('option');
        opt.innerHTML = "All values"
        select.appendChild(opt);

        data.forEach((row) => {
            const opt = document.createElement('option');
            opt.value = row.value;
            opt.innerHTML = `${row.value} (${row.count})`;
            select.appendChild(opt);
        });
        select.selectedIndex = 0
        updateBucketByOption();
    })
    httpGetAsync(`${host}/bucket?by=${bucket}&bucketBorder=${bucketBorder}`, (data) => {
        currentBucketData = data;
        console.log(data)
        updateBucketByOption();
    });
}

function updateBucketByOption() {
    const minDiff = 0.1;
    if (!currentBucketData) { return; }

    const dataToRender = []
    for (var key in currentBucketData) {
        val = currentBucketData[key]
        if (val[true] && val[false]) {
            let diffAbs = parseFloat(val[true]["value"] - val[false]["value"]).toFixed(5)
            let diff = parseFloat(val[true]["value"] / val[false]["value"] - 1.0).toFixed(5)
            if (val[false]["value"] == 0) { diff = 0 }

            if (Math.abs(diff) > minDiff) {
                dataToRender.push({
                    "key": key,
                    "bucket1": val[true],
                    "bucket2": val[false],
                    "diff": diff,
                    "diffAbs": diffAbs
                })
            }
        }
    }
    dataToRender.sort(function(a, b) {
        return b.diff - a.diff;
    })
    console.log(dataToRender)

    allBucketData[0]["x"] = dataToRender.map(({ key }) => key);
    allBucketData[0]["y"] = dataToRender.map(({ diff }) => diff);
    console.log(allBucketData)

    bucketLayout["title"] = `${bucket} being above ${document.getElementById('bucketValue').value} had the following effects on that day in %`
    Plotly.redraw('bucketGraph');
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
    updateKeyForIndex('mood', 0);
    updateKeyForIndex('excitedAboutFuture', 1);
    updateKeyForIndex('sleepDurationWithings', 2);
    updateKeyForIndex('bedTime', 3);
    updateKeyForIndex('gym', 4);

    document.getElementById("bucket-key").value = "alcoholIntake"
    updateBucket();

    // reloadAllData();

    // updateKeyForIndex(keys[0].key, 0);
    // updateKeyForIndex(keys[1].key, 1);
    // updateKeyForIndex(keys[2].key, 2);
    // updateKeyForIndex(keys[3].key, 3);
    // updateKeyForIndex(keys[4].key, 4);
});

function reloadAllData() {
    for (const currentIndex of Array(5).keys()) {
        reloadIndex(currentIndex);
    }
}