debugger;
var data = API.Context.getData();
var currentProgram          = data.currentProgram;
var relatedProjectsVersions = data.relatedProjectsVersions; 


// Data Model for Projects, Milestones, and Versions
        class Version {
			constructor(versionLabel, versionNumber, startDate, dueDate) {
				this.versionLabel = versionLabel; // Unique identifier for the version
				this.versionNumber = versionNumber; // Used only for sorting
				this.startDate = startDate;
				this.dueDate = dueDate;
			}
		}

        class Milestone {
            constructor(name, startDate, dueDate,milestoneURL) {
                this.name = name;
                this.startDate = startDate;
                this.dueDate = dueDate;
				this.milestoneURL = milestoneURL;
                this.versions = [];
            }
            
            addVersion(version) {
                this.versions.push(version);
                this.versions.sort((a, b) => a.versionNumber - b.versionNumber);
            }
        }

        class Project {
            constructor(name, sysId,projectURL) {
                 this.name = name;
				 this.sysId = sysId;
				 this.milestones = [];
				 this.projectURL = projectURL;
            }
            
            addMilestone(milestone) {
                this.milestones.push(milestone);
            }
        }

        let projectData = [];

     
  function generateTable() {
    let tableHeaders = document.getElementById("tableHeaders");
    let subHeaders = document.getElementById("subHeaders");
    let tableBody = document.getElementById("tableBody");
    tableBody.innerHTML = "";

    let maxVersions = Math.max(0, ...projectData.flatMap(p =>
        p.milestones.map(m => Object.keys(m.versions).length)
    ));

    for (let i = 1; i <= maxVersions; i++) {
        let th = document.createElement("th");
        th.setAttribute("colspan", "2");
        th.innerText = `Version ${i}`;
        tableHeaders.appendChild(th);

        let startTh = document.createElement("th");
        startTh.innerText = "Start Date";
        subHeaders.appendChild(startTh);

        let dueTh = document.createElement("th");
        dueTh.innerText = "Due Date";
        subHeaders.appendChild(dueTh);
		// Apply right rounded corner to the last `th` dynamically
        if(i===maxVersions){
		  th.classList.add("round-right");
		}
    }
	
    


    projectData.forEach(project => {
        let projectRowSpan = project.milestones.length;
        project.milestones.forEach((milestone, index) => {
            let row = document.createElement("tr");

            if (index === 0) {
                let projectCell = document.createElement("td");
                projectCell.setAttribute("rowspan", projectRowSpan);
                projectCell.classList.add("project-header");

                // 🔥 Create Project Name as URL
                let projectLink = document.createElement("a");
                projectLink.href = project.projectURL || "#";
                projectLink.innerText = project.name;
                projectLink.classList.add("custom-link");
				projectLink.setAttribute("target", "_blank"); // Open in new tab
				projectLink.setAttribute("rel", "noopener noreferrer"); 

                projectCell.appendChild(projectLink);
                row.appendChild(projectCell);
            }

            let milestoneCell = document.createElement("td");

            // 🔥 Create Milestone Name as URL
            let milestoneLink = document.createElement("a");
            milestoneLink.href = milestone.milestoneURL || "#";
            milestoneLink.innerText = milestone.name;
            milestoneLink.classList.add("custom-link");
			milestoneLink.setAttribute("target", "_blank"); // Open in new tab
            milestoneLink.setAttribute("rel", "noopener noreferrer"); // Security best practice

            milestoneCell.appendChild(milestoneLink);
            row.appendChild(milestoneCell);

            let startDateCell = document.createElement("td");
            startDateCell.classList.add("date-column");
            startDateCell.innerText = milestone.startDate;
            row.appendChild(startDateCell);

            let dueDateCell = document.createElement("td");
            dueDateCell.classList.add("date-column");
            dueDateCell.innerText = milestone.dueDate;
            row.appendChild(dueDateCell);

            let sortedVersions = milestone.versions;
            let sortedVersionsArray = Object.values(sortedVersions).flat();

            for (let i = 0; i < maxVersions; i++) {
                let version = (i < sortedVersionsArray.length) ? sortedVersionsArray[i] : {};
                let versionStart = document.createElement("td");
                versionStart.classList.add("date-column");
                let versionDue = document.createElement("td");
                versionDue.classList.add("date-column");
                versionStart.innerText = version.startDate || "";
                versionDue.innerText = version.dueDate || "";
                row.appendChild(versionStart);
                row.appendChild(versionDue);
            }

            tableBody.appendChild(row);
        });
    });
    API.Utils.endLoading();
}


$(function () {
     API.Utils.beginLoading();
     loadAllVersionsData();
  });
  
/**
 * SQL Query Builder.
 */
function VersionQueryBuilder(versionID) {
   const pagingSuffix = " limit 5000 offset ";
   return "Select SYSID,Name,StartDate,DueDate,C_CRDueDate,C_CRStartDate,C_Scenario1DueDate,C_Scenario1StartDate,C_Scenario2DueDate,C_Scenario2StartDate,C_Scenario3DueDate,C_Scenario3StartDate,VersionSourceObject.StartDate,VersionSourceObject.DueDate,VersionSourceObject.SYSID,Version,Version.C_Version,Version.Project.SYSID,Version.Project.externalid,Version.Project.Name,Version.C_ProgramVersionLabel,Version.CreatedOn,Version.CreatedBy.DisplayName  from MilestoneVersion where Version='/Versions/"+versionID+"'"+" limit 5000 offset "; 
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
 * Load all project versions data sequentially
 */
async function loadAllVersionsData() {
    for (const version of relatedProjectsVersions) {
        await fetchVersionData(version.externalid);
    }
    console.log("✅ All versions loaded!", projectData);
    generateTable();
}


/**
 * Fetch data for a single version and update the model
 */
function fetchVersionData(versionID) {
    return new Promise((resolve) => {
        let query = VersionQueryBuilder(versionID);
        let results = [];
        
        queryMore(0, results, function (finalResults) {
            processVersionData(finalResults, versionID);
            resolve(); // Ensures next loop iteration waits
        }, query);
    });
}

/**
 * Processes the loaded version data and updates the project model
 */
function processVersionData(results, versionID) {
    results.forEach(item => {
        // Assign variables for easier access
        let projectName = item?.Version?.Project?.Name || "Unknown Project";
        let projectSysId = item?.Version?.Project?.SYSID || "Unknown SYSID";
        let milestoneName = item?.Name || "Unknown Milestone";
		let milestoneURL = API.Utils.getObjectUrl(item?.VersionSourceObject?.id)||"";
		let projectUrl = API.Utils.getObjectUrl(item?.Version?.Project?.id)||"";
        let startDate = formatDate(item?.StartDate || item?.C_CRStartDate);
        let dueDate = formatDate(item?.DueDate || item?.C_CRDueDate);
        let versionLabel = item?.Version?.C_ProgramVersionLabel || "Unknown Version"; // Unique identifier
        let versionNumber = item?.Version?.C_Version || 0; // Used only for sorting
        let versionStartDate = formatDate(
            item?.StartDate || item?.C_Scenario1StartDate || item?.C_Scenario2StartDate
        );
        let versionDueDate = formatDate(
            item?.DueDate || item?.C_Scenario1DueDate || item?.C_Scenario2DueDate
        );

        // Find or create project
        let project = projectData.find(p => p.sysId === projectSysId);
        if (!project) {
            project = new Project(projectName, projectSysId,projectUrl);
            projectData.push(project);
        }

        //console.log("Milestone Name from API:", milestoneName);
        //console.log("Existing Milestones:", project.milestones);

        // Find or create milestone
        let milestone = project.milestones.find(m => m.name.toLowerCase() === milestoneName.toLowerCase());
        if (!milestone) {
            milestone = new Milestone(milestoneName, startDate, dueDate,milestoneURL);
            project.addMilestone(milestone);
        }

        // Group versions by C_ProgramVersionLabel (Ensuring unique versionLabel)
        if (!milestone.versions[versionLabel]) {
            milestone.versions[versionLabel] = [];
        }

        // Check if the version already exists (Prevent duplicate versions)
        let existingVersion = milestone.versions[versionLabel].find(v => v.versionLabel === versionLabel);
        if (!existingVersion) {
            let version = new Version(versionLabel, versionNumber, versionStartDate, versionDueDate);
            milestone.versions[versionLabel].push(version);
        }

        // Sort versions within the label based on versionNumber
        milestone.versions[versionLabel].sort((a, b) => a.versionNumber - b.versionNumber);
    });
}


/**
 * Formats date to dd-MMM-yyyy (e.g., 12-Feb-2025)
 */
function formatDate(dateString) {
    if (!dateString) return "";
    let date = new Date(dateString);
    if (isNaN(date)) return "";

    const options = { day: "2-digit", month: "short", year: "numeric" };
    return date.toLocaleDateString("en-GB", options).replace(" ", "-"); // Converts to dd-MMM-yyyy
}
