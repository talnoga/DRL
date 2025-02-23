debugger;
var data = API.Context.getData();
var currentProject=data.currentProject;
var projectExternalId = currentProject.externalid; 
var projDirectChildren = data.projDirectChildren;
// Global GanttDataManager instance
var ganttManager;
var gantt;
var dependencyManager;  

/**
 * Gantt Data Manager to manage hierarchical data.
 */
class GanttDataManager {
    constructor() {
        this.data = []; // Holds the hierarchical structure
        this.map = new Map(); // Quick lookup for any item by ID
        this.pendingTasks = []; // Holds tasks whose parents are not yet loaded
    }

    addItem(item) {
        if (this.map.has(item.id)) {
            let existingItem = this.map.get(item.id);
            existingItem.name = item.name || existingItem.name;
            existingItem.type = item.type || existingItem.type;
            existingItem.start = item.start || existingItem.start;
            existingItem.end = item.end || existingItem.end;
            existingItem.progress = item.progress !== undefined ? item.progress : existingItem.progress;

            if (item.parentId && existingItem.parentId !== item.parentId) {
                this.moveItem(item.id, item.parentId);
            }
        } else {
            const newItem = {
                id: item.id,
                name: item.name,
                type: item.type,
                start: item.start || null,
                end: item.end || null,
                progress: item.progress || 0,
                parentId: item.parentId || null,
                children: []
            };

            this.map.set(newItem.id, newItem);

            if (item.parentId) {
                let parent = this.map.get(item.parentId);
                if (parent) {
                    parent.children.push(newItem);
                } else {
                    this.pendingTasks.push(newItem);
                }
            } else {
                this.data.push(newItem);
            }
        }
        this.resolvePendingTasks();
    }

    moveItem(itemId, newParentId) {
        if (!this.map.has(itemId) || !this.map.has(newParentId)) return;

        let item = this.map.get(itemId);
        let newParent = this.map.get(newParentId);

        this.data = this.data.filter(obj => obj.id !== itemId);
        this.map.forEach(parent => {
            parent.children = parent.children.filter(child => child.id !== itemId);
        });

        newParent.children.push(item);
    }

    resolvePendingTasks() {
        let unresolved = [];
        this.pendingTasks.forEach(task => {
            let parent = this.map.get(task.parentId);
            if (parent) {
                parent.children.push(task);
            } else {
                unresolved.push(task);
            }
        });
        this.pendingTasks = unresolved;
    }

    getFlattenedData() {
           
        function flatten(items) {
            let result = [];
            items.forEach(item => {
                result.push({
                    id: item.id,
                    name: getIcon(item.type) + item.name, // Adds the icon dynamically
                    start: item.start,
                    end: item.end,
                    progress: item.progress,
                    dependencies: item.dependencies || "",
                    custom_class: item.type
                });
                if (item.children.length > 0) {
                    result = result.concat(flatten(item.children));
                }
            });
            return result;
        }
        return flatten(this.data);
    }

    printGanttHierarchy() {
        function printHierarchy(items, level = 0) {
            items.forEach(item => {
                console.log(`${"  ".repeat(level)}📌 ${item.name} (${item.type})`);
                printHierarchy(item.children, level + 1);
            });
        }
        console.log("\n📊 Gantt Hierarchy:");
        printHierarchy(this.data);
    }
}

//holde and manage depandancies
class DependencyManager {
    constructor() {
        this.dependencies = [];
    }

    /**
     * Adds a dependency entry to the manager
     * @param {Object} dependency - The dependency object from API response
     */
    addDependency(dependency) {
        this.dependencies.push({
            dependencyId: dependency.id,
            workItem: {
                id: dependency.WorkItem.id,
                externalId: dependency.WorkItem.externalid,
                sysId: dependency.WorkItem.SYSID,
                name: dependency.WorkItem.Name
            },
            dependsOn: {
                id: dependency.DependsOn.id,
                externalId: dependency.DependsOn.externalid,
                sysId: dependency.DependsOn.SYSID,
                name: dependency.DependsOn.Name
            },
            dependencyType: dependency.DependencyType ? dependency.DependencyType.Name : "Unknown"
        });
    }

    /**
     * Processes an array of dependency responses and adds them to the manager
     * @param {Array} results - Array of dependency objects from API response
     */
    loadDependencies(results) {
        results.forEach(dependency => this.addDependency(dependency));
    }

    /**
     * Retrieves all stored dependencies
     * @returns {Array} - List of dependencies
     */
    getDependencies() {
        return this.dependencies;
    }
}

function updateTaskDependencies() {
    var deps = dependencyManager.getDependencies();
    deps.forEach(function(dep) {
        var dependentTaskId = dep.dependsOn.externalId;
        var dependencyTaskId = dep.workItem.externalId;
        if (ganttManager.map.has(dependentTaskId)) {
            let dependentTask = ganttManager.map.get(dependentTaskId);
            dependentTask.dependencies = dependentTask.dependencies ? dependentTask.dependencies + "," + dependencyTaskId : dependencyTaskId;
        }
    });
    console.log("Updated dependencies in ganttManager:", ganttManager.getFlattenedData());
}

function getIcon(type) {
    switch (type) {
        case "program": return "🚀 ";
        case "project": return "📁 ";
        case "milestone": return "🔷 ";
        case "task": return "✅ ";
        default: return "";
    }
}

/**
 * Initializes project data and loads tasks.
 */
function initializeProjectData() {
    loadProjectData(currentProject, projDirectChildren);     

    let resultQry = [];
    const query = QueryBuilder(1);
    queryMore(0, resultQry, function (results) {
        loadTasks(results);
        updateTaskDependencies();
        initializeGanttChart();
    }, query);
}

//will be called to load the dependacies 
function loadDepandecies(){
    let resultQry = [];
    const query = QueryBuilder(2);
    queryMore(0, resultQry, function (results) {
        dependencyManager.loadDependencies(results);
        initializeProjectData() ;
    }, query);
}

/**
 * Converts the GanttDataManager model into a Gantt tasks array (without dependencies).
 * @returns {Array} Flattened list for Gantt chart
 */
function buildGanttTasks() {
    return ganttManager.getFlattenedData();
}

/**
 * Initializes the Gantt chart after tasks are loaded.
 */
function initializeGanttChart() {
    console.log("Building Gantt chart...");
    let tasks = buildGanttTasks();
    console.log("Generated tasks:", tasks);

    gantt = new Gantt("#gantt-container", tasks, {
        view_mode: "Day",
        language: "en",
        on_render: function () {
            requestAnimationFrame(applyBarClasses);
        }
    });
    API.Utils.endLoading();
    setTimeout(() => {
        requestAnimationFrame(applyBarClasses);
    }, 50);
}

/**
 * Loads project data into GanttDataManager.
 */
function loadProjectData(currentProject, projDirectChildren) {
    ganttManager.addItem({
        id: currentProject.externalid,
        name: currentProject.Name,
        type: currentProject.EntityType.toLowerCase(),
        start: currentProject.StartDate || currentProject.C_CRStartDate || null,
        end: currentProject.DueDate || currentProject.C_CRDueDate || null,
        progress: currentProject.PercentCompleted || 0
    });

    projDirectChildren.forEach(child => {
        ganttManager.addItem({
            id: child.externalid,
            name: child.Name,
            type: child.EntityType.toLowerCase(),
            start: child.StartDate || child.C_CRStartDate || null,
            end: child.DueDate || child.C_CRDueDate || null,
            progress: child.PercentCompleted || 0,
            parentId: child["Parent.externalid"] || currentProject.externalid
        });
    });

    console.log("Loaded project data:", ganttManager.getFlattenedData());
}

/**
 * Loads tasks into GanttDataManager.
 */
function loadTasks(results) {
    
    results.forEach(task => {
        ganttManager.addItem({
            id: task.externalid,
            name: getIcon(task.EntityType) + task.Name, // Adds the icon dynamically
            type: task.EntityType.toLowerCase(), // Ensure type is in lowercase
            start: task.StartDate || task.C_CRStartDate || null,
            end: task.DueDate || task.C_CRDueDate || null,
            progress: task.PercentCompleted || 0,
            parentId: task.Parent.externalid || null
        });
    });

    console.log("All tasks loaded:", ganttManager.printGanttHierarchy());
}

/**
 * SQL Query Builder.
 */
function QueryBuilder(caseNumber) {
    const pagingSuffix = " limit 5000 offset ";

    switch (caseNumber) {
        case 1:
            return `Select Name,SYSID,externalid,EntityType,Parent.externalid,Parent.Name,Parent.SYSID,StartDate,DueDate,C_CRStartDate,C_CRDueDate,PercentCompleted from Task where Project='/Project/${projectExternalId}' and Parent<>'/Project/${projectExternalId}'${pagingSuffix}`;
        case 2:
            return `Select WorkItem.externalid, WorkItem.SYSID, WorkItem.Name, DependsOn.externalid, DependsOn.SYSID, DependsOn.Name, DependencyType.Name from DependencyLink where WorkItem in (Select SYSID from WORKITEM where Project='/Project/${projectExternalId}')${pagingSuffix}`;
        default:
            return "";
    }
}



/**
 * Recursive Query Function.
 */
function queryMore(from, allResults, callback, qry) {
    API.Objects.query(qry + " " + from, function (results, nextQuery) {
        if (results.length > 0) {
            allResults = allResults.concat(results);
        }
        if (nextQuery && nextQuery.q.paging.hasMore) {
            queryMore(nextQuery.q.paging.from, allResults, callback, qry);
        } else {
            callback(allResults);
        }
    }, {});
}

/**
 * Calls the initialization function on page load.
 */
$(function () {
    ganttManager = new GanttDataManager();
    dependencyManager = new DependencyManager();

    API.Utils.beginLoading();
    loadDepandecies();
    // Register Change View Buttons (Now includes "Quarter" and "Year")
    let viewButtons = ["hourView", "dayView", "weekView", "monthView", "quarterView", "yearView"];
    viewButtons.forEach(buttonId => {
        let button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener("click", function (event) {
                changeView(event, button.dataset.view);
            });
        }
    });

});

// Function to Change Zoom Level
function changeView(event, viewMode) {
    if (viewMode === "Quarter") {
        gantt.change_view_mode("Month"); // Use "Month" mode for quarters (best alternative)
    } else if (viewMode === "Year") {
        gantt.change_view_mode("Month"); // Use "Month" mode for years (best alternative)
    } else {
        gantt.change_view_mode(viewMode);
    }

    setTimeout(() => {
        requestAnimationFrame(applyBarClasses);
    }, 300);
}


 // Function to Apply Colors to Bars
 function applyBarClasses() {
    const bars = document.querySelectorAll("svg .bar-group");

    if (bars.length === 0) {
        console.warn("Gantt bars not found yet, retrying...");
        requestAnimationFrame(applyBarClasses);
        return;
    }

    bars.forEach(bar => {
        let taskName = extractTaskName(bar);
        if (!taskName) return;

        let rects = bar.querySelectorAll("rect");

        if (rects.length < 2) return; // Not enough rects found

        let mainBar = rects[0]; // First <rect> is always the main bar
        let progressBar = rects[1]; // Second <rect> is the progress bar
        // Third <rect> is usually the label background (we ignore it)

        // Remove old classes before adding new ones
        mainBar.classList.remove("program-bar", "project-bar", "milestone-bar", "task-bar");
        progressBar.classList.remove("program-progress", "project-progress", "milestone-progress", "task-progress");

        if (taskName.includes("🚀")) {
            mainBar.classList.add("program-bar");
            progressBar.classList.add("program-progress");
        } else if (taskName.includes("📁")) {
            mainBar.classList.add("project-bar");
            progressBar.classList.add("project-progress");
        } else if (taskName.includes("🔷")) {
            mainBar.classList.add("milestone-bar");
            progressBar.classList.add("milestone-progress");
            //addMilestoneDiamond(bar);
        } else if (taskName.includes("✅")) {
            mainBar.classList.add("task-bar");
            progressBar.classList.add("task-progress");
        }
    });
}

// Function to Extract Task Name from Gantt SVG Elements
function extractTaskName(barElement) {
    let title = barElement.querySelector("title");
    if (title) return title.textContent.trim();

    let textElement = barElement.querySelector("text");
    if (textElement) return textElement.textContent.trim();

    console.warn("Task name not found for bar:", barElement);
    return null;
}

 // Function to Add a Diamond in the Middle of a Milestone Bar
 function addMilestoneDiamond(barElement) {
    let rect = barElement.querySelector("rect");
    if (!rect) return;

    let svg = barElement.closest("svg");
    let x = parseFloat(rect.getAttribute("x")) + parseFloat(rect.getAttribute("width")) / 2;
    let y = parseFloat(rect.getAttribute("y")) + parseFloat(rect.getAttribute("height")) / 2;

    let diamond = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    diamond.setAttribute("points", `${x-5},${y} ${x},${y-5} ${x+5},${y} ${x},${y+5}`);
    diamond.setAttribute("class", "milestone-icon");

    svg.appendChild(diamond);
}