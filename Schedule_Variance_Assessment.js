debugger;
var data = API.Context.getData();
var currentProject = data.currentProject;
var projectExternalId = currentProject.externalid;
var projDirectChildren = data.projDirectChildren;
var allWorkItems= data.allWorkItems;
// Global GanttDataManager instancea


var dependencyManager;

var ganttManagerLeft;
var ganttManagerRight;
var ganttLeft;
var ganttRight;

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
            existingItem.OnCriticalPath = item.OnCriticalPath || existingItem.OnCriticalPath;

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
                OnCriticalPath: item.OnCriticalPath||null,
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
        function flatten(items, parentId = null) {
            let result = [];
            items.forEach(item => {
                let newItem = {
                    id: item.id,
                    name: getIcon(item.type) + item.name, // Restore icon dynamically
                    type: item.type,
                    start: item.start,
                    end: item.end,
                    progress: item.progress,
                    dependencies: item.dependencies || "",
                    custom_class: item.type, // Ensure class for styling is retained
                    parentId: parentId, // Maintain hierarchy tracking
                    OnCriticalPath: item.OnCriticalPath
                };
                result.push(newItem);

                // If the item has children, flatten them but retain hierarchy tracking
                if (item.children && item.children.length) {
                    result = result.concat(flatten(item.children, item.id));
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
    deps.forEach(function (dep) {
        var dependentTaskId = dep.dependsOn.externalId;
        var dependencyTaskId = dep.workItem.externalId;
        if (ganttManagerLeft.map.has(dependentTaskId)) {
            let dependentTask = ganttManagerLeft.map.get(dependentTaskId);
            dependentTask.dependencies = dependentTask.dependencies ? dependentTask.dependencies + "," + dependencyTaskId : dependencyTaskId;
        }
        if (ganttManagerRight.map.has(dependentTaskId)) {
            let dependentTask = ganttManagerRight.map.get(dependentTaskId);
            dependentTask.dependencies = dependentTask.dependencies ? dependentTask.dependencies + "," + dependencyTaskId : dependencyTaskId;
        }

    });
    // console.log("Updated dependencies in ganttManager:", ganttManager.getFlattenedData());
}

function getIcon(type) {
    switch (type) {
        case "program": return "💼 ";
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
function loadDepandecies() {
    let resultQry = [];
    const query = QueryBuilder(2);
    queryMore(0, resultQry, function (results) {
        dependencyManager.loadDependencies(results);
        initializeProjectData();
    }, query);
}

/**
 * Converts the GanttDataManager model into a Gantt tasks array (without dependencies).
 * @returns {Array} Flattened list for Gantt chart
 */
function buildGanttTasks(ganttManager) {
    return ganttManager.getFlattenedData();
}

/**
 * Initializes the Gantt chart after tasks are loaded.
 */
function initializeGanttChart() {
    console.log("Building Gantt chart...");
    let leftTasks = buildGanttTasks(ganttManagerLeft);
    let rightTask = buildGanttTasks(ganttManagerRight);
    // console.log("Generated tasks:", tasks);

    ganttLeft = new Gantt("#gantt-container-left", leftTasks, {
        view_mode: "Day",
        language: "en",
        on_render: function () {
            requestAnimationFrame(applyBarClasses);
        }
    });

    ganttRight = new Gantt("#gantt-container-right", rightTask, {
        view_mode: "Day",
        language: "en",
        on_render: function () {
            requestAnimationFrame(applyBarClasses);
        }
    });

    API.Utils.endLoading();
    regiterSCrolls();
    setTimeout(() => {
        requestAnimationFrame(applyBarClasses);
    }, 50);
}

/**
 * Loads project data into GanttDataManager.
 */
function loadProjectData(currentProject, projDirectChildren) {
    ganttManagerLeft.addItem({
        id: currentProject.externalid,
        name: currentProject.Name,
        type: currentProject.EntityType.toLowerCase(),
        start: currentProject.StartDate || null,
        end: currentProject.DueDate || null,
        progress: currentProject.PercentCompleted || 0,
        OnCriticalPath: currentProject.OnCriticalPath
    });
    ganttManagerRight.addItem({
        id: currentProject.externalid,
        name: currentProject.Name,
        type: currentProject.EntityType.toLowerCase(),
        start: currentProject.C_CRStartDate !== null && currentProject.C_CRStartDate !== undefined
            ? currentProject.C_CRStartDate
            : currentProject.StartDate || null,
        end: currentProject.C_CRDueDate !== null && currentProject.C_CRDueDate !== undefined
            ? currentProject.C_CRDueDate
            : currentProject.DueDate || null,
        progress: currentProject.PercentCompleted || 0,
        OnCriticalPath: currentProject.OnCriticalPath
    });

    projDirectChildren.forEach(child => {
        ganttManagerLeft.addItem({
            id: child.externalid,
            name: child.Name,
            type: child.EntityType.toLowerCase(),
            start: child.StartDate || null,
            end: child.DueDate || null,
            progress: child.PercentCompleted || 0,
            OnCriticalPath: child.OnCriticalPath,
            parentId: child["Parent.externalid"] || currentProject.externalid
        });
        ganttManagerRight.addItem({
            id: child.externalid,
            name: child.Name,
            type: child.EntityType.toLowerCase(),
            start: child.C_CRStartDate !== null && child.C_CRStartDate !== undefined
                ? child.C_CRStartDate
                : child.StartDate || null,
            end: child.C_CRDueDate !== null && child.C_CRDueDate !== undefined
                ? child.C_CRDueDate
                : child.DueDate || null,
            progress: child.PercentCompleted || 0,
            OnCriticalPath: child.OnCriticalPath,
            parentId: child["Parent.externalid"] || currentProject.externalid
        });
    });

    //console.log("Loaded project data:", ganttManager.getFlattenedData());
}

/**
 * Loads tasks into GanttDataManager.
 */
function loadTasks(results) {

    results.forEach(task => {
        ganttManagerLeft.addItem({
            id: task.externalid,
            name: getIcon(task.EntityType) + task.Name, // Adds the icon dynamically
            type: task.EntityType.toLowerCase(), // Ensure type is in lowercase
            start: task.StartDate || null,
            end: task.DueDate || null,
            progress: task.PercentCompleted || 0,
            parentId: task.Parent.externalid || null,
            OnCriticalPath:task.OnCriticalPath || null
        });
        ganttManagerRight.addItem({
            id: task.externalid,
            name: getIcon(task.EntityType) + task.Name, // Adds the icon dynamically
            type: task.EntityType.toLowerCase(), // Ensure type is in lowercase
            start: task.C_CRStartDate !== null && task.C_CRStartDate !== undefined
                ? task.C_CRStartDate
                : task.StartDate || null,

            end: task.C_CRDueDate !== null && task.C_CRDueDate !== undefined
                ? task.C_CRDueDate
                : task.DueDate || null,
            progress: task.PercentCompleted || 0,
            parentId: task.Parent.externalid || null,
            OnCriticalPath:task.OnCriticalPath || null
        });
    });

    // console.log("All tasks loaded:", ganttManager.printGanttHierarchy());
}

/**
 * SQL Query Builder.
 */
function QueryBuilder(caseNumber) {
    const pagingSuffix = " limit 5000 offset ";

    switch (caseNumber) {
        case 1:
            return `Select Name,SYSID,externalid,EntityType,Parent.externalid,Parent.Name,Parent.SYSID,StartDate,DueDate,C_CRStartDate,C_CRDueDate,PercentCompleted,OnCriticalPath from Task where Project='/Project/${projectExternalId}' and Parent<>'/Project/${projectExternalId}'${pagingSuffix}`;
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
    ganttManagerLeft = new GanttDataManager();
    ganttManagerRight = new GanttDataManager();
    dependencyManager = new DependencyManager();

    API.Utils.beginLoading();
    loadDepandecies();

    // Register Time View Buttons
    let viewButtons = ["dayView", "weekView", "monthView", "quarterView", "yearView"];
    viewButtons.forEach(buttonId => {
        let button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener("click", function (event) {
                changeView(event, button.dataset.view);
            });
        }
    });

    // Register Type Filter Buttons
    let typeButtons = ["allFilter", "projectFilter", "milestoneFilter", "taskFilter"];
    typeButtons.forEach(buttonId => {
        let button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener("click", function () {
                applyGanttFilter(button.dataset.filter);
            });
        }
    });
});

function regiterSCrolls() {
    const leftScrollable = document.querySelector("#gantt-container-left .gantt-container");
    const rightScrollable = document.querySelector("#gantt-container-right .gantt-container");

    //wrapper divs
    const leftGanttWrapper = document.querySelector("#gantt-container-left").closest(".gantt-wrapper");
    const rightGanttWrapper = document.querySelector("#gantt-container-right").closest(".gantt-wrapper");

    if (!leftScrollable || !rightScrollable || !leftGanttWrapper || !rightGanttWrapper) {
        console.warn("Could not find actual scrollable elements.");
        return;
    }
    let isSyncingLeft = false;
    let isSyncingRight = false;

    let isSyncingLeftWrapper = false;
    let isSyncingRightWrapper = false;

    leftGanttWrapper.addEventListener("scroll", function () {
        syncScroll(leftGanttWrapper, rightGanttWrapper, isSyncingLeftWrapper);
    });

    rightGanttWrapper.addEventListener("scroll", function () {
        syncScroll(rightGanttWrapper, leftGanttWrapper, isSyncingRightWrapper);
    });

    leftScrollable.addEventListener("scroll", function () {
        console.log("Left container scrolled!", leftScrollable.scrollTop, leftScrollable.scrollLeft);
        syncScroll(leftScrollable, rightScrollable, isSyncingRight);
        updateStickyHeader(leftScrollable);
    });

    rightScrollable.addEventListener("scroll", function () {
        console.log("Right container scrolled!", rightScrollable.scrollTop, rightScrollable.scrollLeft);
        syncScroll(rightScrollable, leftScrollable, isSyncingLeft);
        updateStickyHeader(rightScrollable);
    });
}

function updateStickyHeader(scrollContainer) {
    const gridHeader = scrollContainer.querySelector("g.grid"); // The header rect
    const dateLabels = scrollContainer.querySelector("g.date"); // The date text

    if (gridHeader) {
        gridHeader.setAttribute("transform", `translate(0, ${scrollContainer.scrollTop})`);
        gridHeader.style.pointerEvents = "none"; // Ensures clicks pass through
    }
    if (dateLabels) {
        dateLabels.setAttribute("transform", `translate(0, ${scrollContainer.scrollTop})`);
        dateLabels.style.pointerEvents = "none";
    }
}


//sync Gantts scrolls
function syncScroll(source, target, isSyncingFlag) {
    if (!isSyncingFlag) {
        isSyncingFlag = true;
        target.scrollLeft = source.scrollLeft;
        target.scrollTop = source.scrollTop;
        isSyncingFlag = false;
    }
}

// Function to Change Zoom Level
function changeView(event, viewMode) {
    if (viewMode === "Quarter" || viewMode === "Year") {
        ganttLeft.change_view_mode("Month");
        ganttRight.change_view_mode("Month");
    } else {
        ganttLeft.change_view_mode(viewMode);
        ganttRight.change_view_mode(viewMode);
    }

    setTimeout(() => {
        requestAnimationFrame(applyBarClasses);
    }, 300);
}


// Function to filter tasks while preserving hierarchy and selective dependencies
function applyGanttFilter(filterType) {
    // If filterType is empty, restore the original data
    if (!filterType) {
        initializeGanttChart(); // Reset Gantt Chart to its original data
        return;
    }

    let allTasksLeft = ganttManagerLeft.getFlattenedData();// Flattened list
    let allTasksRight = ganttManagerRight.getFlattenedData();// Flattened list
    let filteredTasksLeft = new Set();
    let filteredTasksRight = new Set();
    let leftParentTasksToKeep = new Set();
    let rightParentTasksToKeep = new Set();

    // First, filter left tasks that match the type
    allTasksLeft.forEach(task => {
        if (task.type === filterType) {
            filteredTasksLeft.add(task);
            leftParentTasksToKeep.add(task.parentId); // Track parents to keep
        }
    });

    // First, filter right tasks that match the type
    allTasksRight.forEach(task => {
        if (task.type === filterType) {
            filteredTasksRight.add(task);
            rightParentTasksToKeep.add(task.parentId); // Track parents to keep
        }
    });

    // Ensure parents are included if any child is included
    allTasksLeft.forEach(task => {
        if (leftParentTasksToKeep.has(task.id)) {
            filteredTasksLeft.add(task);
            leftParentTasksToKeep.add(task.parentId); // Ensure full hierarchy is kept
        }
    });

    // Ensure parents are included if any child is included
    allTasksRight.forEach(task => {
        if (rightParentTasksToKeep.has(task.id)) {
            filteredTasksRight.add(task);
            rightParentTasksToKeep.add(task.parentId); // Ensure full hierarchy is kept
        }
    });

    // Keep left dependencies only when both dependent & dependency exist
    filteredTasksLeft.forEach(task => {
        if (task.dependencies) {
            task.dependencies.split(",").forEach(dep => {
                if (filteredTasksLeft.has(dep)) {
                    let depTask = allTasksLeft.find(t => t.id === dep);
                    let dependentTask = allTasksLeft.find(t => t.id === task.id);
                    if (depTask) filteredTasksLeft.add(depTask);
                    if (dependentTask) filteredTasksLeft.add(dependentTask);
                }
            });
        }
    });

    // Keep right dependencies only when both dependent & dependency exist
    filteredTasksRight.forEach(task => {
        if (task.dependencies) {
            task.dependencies.split(",").forEach(dep => {
                if (filteredTasksRight.has(dep)) {
                    let depTask = allTasksRight.find(t => t.id === dep);
                    let dependentTask = allTasksRight.find(t => t.id === task.id);
                    if (depTask) filteredTasksRight.add(depTask);
                    if (dependentTask) filteredTasksRight.add(dependentTask);
                }
            });
        }
    });


    // Convert Set back to an array while preserving hierarchy
    let finalFilteredTasks = [];
    let finalLeftFilteredTasks = [];
    let finalRightFilteredTasks = [];

    function restoreHierarchyLeft(taskList, parentId = null) {
        taskList.forEach(task => {
            if (task.parentId === parentId) {
                finalLeftFilteredTasks.push(task);
                restoreHierarchyLeft(taskList, task.id, finalLeftFilteredTasks); // Recursively add children
            }
        });
    }

    function restoreHierarchyright(taskList, parentId = null) {
        taskList.forEach(task => {
            if (task.parentId === parentId) {
                finalRightFilteredTasks.push(task);
                restoreHierarchyright(taskList, task.id, finalRightFilteredTasks); // Recursively add children
            }
        });
    }

    restoreHierarchyright(Array.from(filteredTasksRight));
    restoreHierarchyLeft(Array.from(filteredTasksLeft));

    // Ensure the left root node is kept
    let leftRootNode = allTasksLeft.find(t => !t.parentId);
    if (leftRootNode && !filteredTasksLeft.has(leftRootNode)) {
        finalLeftFilteredTasks.unshift(leftRootNode);
    }

    // Ensure the left root node is kept
    let righRootNode = allTasksRight.find(t => !t.parentId);
    if (righRootNode && !filteredTasksRight.has(righRootNode)) {
        finalFilterefinalRightFilteredTasksdTasks.unshift(righRootNode);
    }

    // Re-initialize the Gantt chart with the filtered data
    ganttLeft = new Gantt("#gantt-container-left", finalLeftFilteredTasks, {
        view_mode: "Day",
        language: "en",
        on_render: function () {
            requestAnimationFrame(applyBarClasses);
        }
    });

    // Re-initialize the Gantt chart with the filtered data
    ganttRight = new Gantt("#gantt-container-right", finalRightFilteredTasks, {
        view_mode: "Day",
        language: "en",
        on_render: function () {
            requestAnimationFrame(applyBarClasses);
        }
    });
    regiterSCrolls();

    setTimeout(() => {
        requestAnimationFrame(applyBarClasses);
    }, 50);
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
    let textElement = barElement.querySelector(".bar-label"); // Now explicitly targeting the correct element
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
    diamond.setAttribute("points", `${x - 5},${y} ${x},${y - 5} ${x + 5},${y} ${x},${y + 5}`);
    diamond.setAttribute("class", "milestone-icon");

    svg.appendChild(diamond);
}

