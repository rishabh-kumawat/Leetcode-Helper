/* eslint-disable no-unused-vars */
// The module 'vscode' contains the VS Code extensibility API

// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const URL = require('url').URL;
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { exec } = require('node:child_process');
const { TextEncoder } = require('util');
const cheerio = require('cheerio');


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
*/

function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "leetcode-helper-lh-" is now active!');
	// let outputExamples = [];
	
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('leetcode-helper-lh-.helloWorld', function () {
		// The code you place here will be executed every time your command is executed
		
		// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from Leetcode Helper(LH)!');
	// });
	
	// context.subscriptions.push(disposable);
	const runWithTimeout = async (fn, timeout, ...args) => {
		const timeoutPromise = new Promise((_, reject) =>
		  setTimeout(() => reject(new Error('Function timed out')), timeout)
		);
	  
		return Promise.race([
		  fn(...args), // Execute the function
		  timeoutPromise,
		]);
	};

	function ensureDirectoryAndFile(fileName, defaultFileContent = '') {

		let directoryPath ;
		const folder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : undefined;
		
		if (folder) {
			// console.log('Current workspace directory:', folder.uri.fsPath);
			directoryPath = folder.uri.fsPath;
		} else {
			vscode.window.showWarningMessage('No workspace folder is opened.');
			return
		}

		directoryPath = path.join(directoryPath || '', '.lph');
		// Check if the directory exists
		if (!fs.existsSync(directoryPath)) {
			// console.log(`Directory not found. Creating directory: ${directoryPath}`);
			fs.mkdirSync(directoryPath, { recursive: true });
		} else {
			// console.log(`Directory already exists: ${directoryPath}`);
		}

		// Construct the full file path
		const filePath = path.join(directoryPath, fileName);
		// console.log(filePath);

		// Check if the file exists
		if (!fs.existsSync(filePath)) {
			// console.log(`File not found. Creating file: ${filePath}`);
			fs.writeFileSync(filePath, defaultFileContent, 'utf8');
		} else {
			// console.log(`File already exists: ${filePath}`);
		}

		// Return the file path for further use
		return filePath;
	}
	
	
	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-helper-lh-.fetchTestCases', async ()=> {
			const inputExamples = [];
			const outputTestCases = [];
			let tempSnippet;
			let testCases=[];

			const link = await vscode.window.showInputBox();
			
			const isValidUrl = (s) => {
				try {
				  const parsedUrl = new URL(s);
				  return (parsedUrl.hostname === "leetcode.com" && parsedUrl.pathname.includes("problems"));

				} catch (err) {
					return false;
				}
			};

			let queLink;
			if(!isValidUrl(link)){
				vscode.window.showErrorMessage('Invalid Link. Provide correct problem link');
				return;
			}
			else{
				const question = link.match(/problems\/([^/]+)/)?.[1];
				if(!question) return;
				let que = question.split(' ').join('-');
				queLink = "https://leetcode.com/problems/"+que;
			}

			async function getTestExamples(language){
				
				let browser = await puppeteer.launch({
						headless: false,
						defaultViewport: null,
						args: ['--disable-gpu', '--no-sandbox', '--disable-software-rasterizer','--start-maximized']
					});
				
				const page = await browser.newPage();
					
						
				await page.goto(queLink,{
					waitUntil: 'networkidle0',
				});
				
				async function extractTestcases(){
					try {
						const content = await page.content();
						const $ = cheerio.load(content);
						
						let groupedTestCases = [];
				
						const parseValue = (value) => {
							if (typeof value !== 'string') return value;
							value = value.trim();
							
							if (value.startsWith('[') && value.endsWith(']')) {
								try {
									const arrayValue = JSON.parse(value);
									return arrayValue.map(item => 
										typeof item === 'string' && !isNaN(Number(item)) ? Number(item) : item
									);
								} catch (e) {
									console.error('Error parsing array:', e);
									return value;
								}
							}
							
							if (value.startsWith('"') && value.endsWith('"')) {
								return value.slice(1, -1);
							}
							
							if (!isNaN(Number(value))) {
								return Number(value);
							}
							
							return value;
						};
				
						const extractInputs = (text) => {
							text = text.replace(/^Input:?\s*/i, '').trim();
							
							const varRegex = /(\w+)\s*=\s*("[^"]+"|'[^']+'|\[[^\]]+\]|-?\d+)/g;
							const variables = {};
							let match;
							let hasVariables = false;
							
							while ((match = varRegex.exec(text)) !== null) {
								hasVariables = true;
								const [_, varName, value] = match;
								variables[varName] = value;
							}
							
							if (hasVariables) {
							// 	// If we found variables, return them as an array
								return Object.values(variables);
							} else {
								text = text.replace(/^s\s*=\s*/, '').trim();
								return text;
							}
						};
				
						$('.example-block').each((_, element) => {
							const $element = $(element);
							const inputText = $element.find('p:contains("Input:")').text().trim();
							const outputText = $element.find('p:contains("Output:")').text().trim();
							// console.log(inputText);
							// console.log(outputText);
							if (inputText && outputText) {
								const inputs = extractInputs(inputText);
								const output = parseValue(outputText.replace(/^Output:?\s*/i, '').trim());
								// console.log(inputs);
								// console.log(output);
								inputExamples.push(inputs);
								outputTestCases.push((output));
								groupedTestCases.push({
									input: inputs,
									output: output
								});
							}
						});
				
						if (groupedTestCases.length === 0) {
							$('pre').each((_, element) => {
								const text = $(element).text().trim();
								// console.log(text);
								const [inputSection, outputSection] = text.split(/Output:/i).map(s => s.trim());
								
								if (inputSection && outputSection) {
									const inputs = extractInputs(inputSection);
									const output = parseValue(outputSection.split('\n')[0].trim());
									
									inputExamples.push(inputs);
									outputTestCases.push((output));
									groupedTestCases.push({
										input: inputs,
										output: output
									});
								}
							});
						}
				
						if (groupedTestCases.length === 0) {
							// vscode.window.showWarningMessage('No test cases found on the page.');
							return [];
						} 
						
						return groupedTestCases;
					} catch (error) {
						vscode.window.showErrorMessage('Failed to extract test cases. See console for details.');
						return [];
					}
				};
				
				async function getCodeSnippet(language){
					
					try{
						const buttons = await page.$$('button'); // Get all button elements
						
						for (const button of buttons) {
							// Get the class attribute of each button
							const className = await page.evaluate(el => el.getAttribute('class'), button);
							const buttonText = await page.evaluate(el => el.textContent, button);
							// console.log(buttonText);
							// Check if the class matches the desired one
							if (className === 'rounded items-center whitespace-nowrap focus:outline-none inline-flex bg-transparent dark:bg-dark-transparent text-text-secondary dark:text-text-secondary active:bg-transparent dark:active:bg-dark-transparent hover:bg-fill-secondary dark:hover:bg-fill-secondary px-1.5 py-0.5 text-sm font-normal group') {
								// Click the button
								// console.log(buttonText);
								if(buttonText != language){
									await button.click();
									// console.log('Button clicked!');
									
									const elements = await page.$$('.flex.items-center'); 
									
									for (const element of elements) {
										// Check if the element contains the text "Python3"
										const textContent = await page.evaluate(el => el.textContent.trim(), element);
										
										if (textContent === language) {
											// Click the element containing "Python3"
											await element.click();
											// console.log('Python button clicked!');
											break; // Exit the loop after clicking
										}
									}
								}
								break; // Exit loop after clicking the button
							}
						}

						await new Promise(resolve => setTimeout(resolve, 1500));

						tempSnippet = await page.$$eval(".view-line", elements =>
							elements.map(el => el.textContent.trim())
						);
					}
					catch (error) {
						vscode.window.showErrorMessage('Failed to extract code snippet');    
					}
				}
				
				testCases = await extractTestcases();
				console.log(testCases);
				
				await getCodeSnippet(language);
				// console.log(tempSnippet);	
				
				
				await browser.close();
			}
			
			function checkTestCases(){
				if (!Array.isArray(testCases) || testCases.length === 0) {
					vscode.window.showErrorMessage('Invalid or empty test cases found.');
					return true;
				}

				const isValidTestCase = (tc) => {
					return tc && 
						typeof tc === 'object' &&
						'input' in tc &&
						'output' in tc &&
						Array.isArray(tc.input);
				};

				const invalidTestCases = testCases.filter(tc => !isValidTestCase(tc));
				if (invalidTestCases.length > 0) {
					vscode.window.showErrorMessage('Invalid test case found.');
					return true;
				}
			}

			async function ensureFileIsOpen() {
				// const activeEditor = vscode.window.activeTextEditor;
			  
				// if (!activeEditor) {
				  // No file is open; prompt the user to create and save a new file
				
					const uri = await vscode.window.showSaveDialog({
						saveLabel: 'Create File',
						filters: {
							'All Files': ['*'],
						},
					});
				
					if (!uri) {
						vscode.window.showErrorMessage('File creation canceled by user.');
						return '';
					}
				
					const filePath = uri.fsPath;
				
					try {
					// Create the file if it doesn't exist
						if (!fs.existsSync(filePath)) {
							fs.writeFileSync(filePath, '', 'utf8'); // Create an empty file
						}
					
						// Open the newly created file in the editor
						const document = await vscode.workspace.openTextDocument(filePath);
						await vscode.window.showTextDocument(document);
					
						vscode.window.showInformationMessage(`File created and opened`);
						return filePath;
					} catch (error) {
						vscode.window.showErrorMessage(`Failed to create a new file: ${error.message}`);
						return '';
					}
			}
			
			const activeDoc = vscode.window.activeTextEditor;
			let filePath = activeDoc? activeDoc.document.fileName :'';

			async function fileOpener() {
				vscode.window.showInformationMessage("Create a valid .cpp or .py file");
				const isFile = await ensureFileIsOpen(); // Wait for the file creation process to complete
				if (!isFile) return; // Exit if the file creation was canceled or failed
				filePath = isFile;
				// At this point, `filePath` is guaranteed to be valid
				// vscode.window.showInformationMessage(`Using file: ${filePath}`);
			}
			
			if(!filePath) await fileOpener();

			const parsedPath = path.parse(filePath);
			const fileNameWithoutExtension = parsedPath.name;

			if (path.extname(filePath) === ".py") {
				
				await getTestExamples("Python");

				// var myInterval = setInterval(getTestExamples("Python"), 100);
				// setTimeout(function(){ clearInterval(myInterval); }, 10000);
				// runWithTimeout(getTestExamples("Python"), 29500)
				// 	// .then((result) => console.log(result))
				// 	.catch((err) => vscode.window.showErrorMessage("Unable to fetch Test Cases."));

				if(checkTestCases()) return;

				// console.log(JSON.stringify(outputTestCases));
				// outputExamples.length = 0;
				// for(let id of outputTestCases){
				// 	// console.log(typeof(id));
				// 	if(Array.isArray(id)) outputExamples.push(JSON.stringify(id));
				// 	else outputExamples.push(id);
				// }
				let filess = ensureDirectoryAndFile(`${fileNameWithoutExtension}_py.txt`,'lph');
				fs.writeFileSync(filess, JSON.stringify(outputTestCases), 'utf8');

				const cltempSnippet = tempSnippet.map(str => 
					str.replace(/\u00A0/g, ' ')
				);
			
		
				const subArr = cltempSnippet.filter(str => str.includes("def"));
				const subArr2 = cltempSnippet.filter(str => str.includes("class"));
				const argumentTypes = cltempSnippet
									.map(line => line.match(/\[([^\]]+)\]/)?.[1]) // Match content within square brackets
									.filter(Boolean);
				// console.log(Array.isArray(cltempSnippet));
				const isLinkedList = argumentTypes.includes("ListNode");
				const isTree = argumentTypes.includes("TreeNode");
				const isBool = (argumentTypes[argumentTypes.length-1] == "Bool");
				// console.log(Array.isArray(tempSnippet));
				const temi = cltempSnippet.indexOf(subArr2[subArr2.length-1]);
				cltempSnippet[temi] = cltempSnippet[temi].replace(/\(.*\)/, '');
				
				// const className = subArr2[0].match(/class\s+(\w+)/)?.[1];
				const functionString = subArr[subArr.length-1];
				// console.log(typeof(functionString))
				const regex = /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/;
				// Regular expression to match the function name
				const match = functionString.match(regex);
				// Extract the function name
				const functionName = match[1]; // Captured function name
				
				let id = cltempSnippet.indexOf(functionString);
				cltempSnippet[id] = '    '+cltempSnippet[id];
				for(let i=id+1;i<cltempSnippet.length;i++) cltempSnippet[i] = '        '+cltempSnippet[i];
				
				let codeSnippet = cltempSnippet.join('\n');
				// console.log(codeSnippet);
				// console.log(testCases);
				// console.log(inputTestCases);
				// console.log(outputTestCases);

const printBool = `
def print_boolean(t):
    print(True if t else False)
`;

const defineLinkedList = `
# Definition for singly-linked list.
class ListNode():
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
`;

const printLinkedList = `\n\n\n
#Helper function to print Linked List
def linked_list_input(vec):
    root = None
    for i in range(len(vec) - 1, -1, -1):
        temp = ListNode(vec[i])
        temp.next = root
        root = temp
    return root

def print_linkedlist(head):
    print("[", end="")
    temp = head
    while temp.next is not None:
        print(temp.val, end=",")
        temp = temp.next
    print(temp.val, end="")
    print("]")
`;

const defineTree = `
# Definition for a binary tree node.
class TreeNode(object):
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
`;

const printTree = `\n\n\n
def tree_input(vec, i=0):
    root = None

    if i < len(vec):
        root = TreeNode(vec[i])

        # Insert left child
        root.left = tree_input(vec, 2 * i + 1)

        # Insert right child
        root.right = tree_input(vec, 2 * i + 2)

    return root

def print_tree(root):
    print("[", end="")
    def inorder_traversal(node):
        if node is not None:
            inorder_traversal(node.left)
            print(node.val, end=",")
            inorder_traversal(node.right)

    inorder_traversal(root)
    print("]")  # Closing the square bracket
`;

				let printFunction = "print";
				if(isLinkedList){
					codeSnippet = defineLinkedList + codeSnippet + printLinkedList;
					printFunction = "print_linkedlist";
				}
				else if(isTree){
					codeSnippet = defineTree + codeSnippet + printTree;
					printFunction = "print_tree";
				}
				else if(isBool){
					codeSnippet = codeSnippet + printBool;
					printFunction = "print_boolean";
				}

				let callingSnippet = "\nsolution = Solution()";
				for(let i=0;i<inputExamples.length;i++){
					let tempfunc = '';
					for(let j=0;j<inputExamples[i].length;j++){
						let args = inputExamples[i][j];
						if(argumentTypes[j] == `ListNode*`){
							args = `linked_List_Input(`+args+`)`;
						}

						if(argumentTypes[j] == `TreeNode*`){
							args = `Tree_Input(`+args+`)`;
						}
						tempfunc += args+",";
					}
					tempfunc = tempfunc.slice(0,-1);
					callingSnippet+=`\n${printFunction}(solution.${functionName}(${tempfunc}))`;
				}
				// console.log(callingSnippet);

				await writeToFile(filePath, codeSnippet+callingSnippet);
			}

			else if(path.extname(filePath) === ".cpp"){

				await getTestExamples("C++");

				if(checkTestCases()) return;
				// extractTestcases();
				// console.log(inputExamples);
				// console.log(outputTestCases);
				const outputExamples = [];
				for(let id of outputTestCases){
					if(Array.isArray(id)) outputExamples.push(JSON.stringify(id));
					else outputExamples.push(id);
				}

				let filess = ensureDirectoryAndFile(`${fileNameWithoutExtension}_cpp.txt`,'lph');
				// console.log(JSON.stringify(outputExamples));
				fs.writeFileSync(filess, JSON.stringify(outputExamples), 'utf8');
				

				const cltempSnippet = tempSnippet.map(str => 
					str.replace(/\u00A0/g, ' ')
				);
			
				const temi = cltempSnippet.indexOf("public:");
				
				cltempSnippet[temi+1] = cltempSnippet[temi+1].replace("&","&&");
				// console.log(cltempSnippet[temi+1]);
				
				
				const functionString = cltempSnippet[temi+1];
				// let functionstr = functionString;
				const argumentTypes = functionString.match(/\(([^)]+)\)/)?.[1]
									.split(',')
									.map(arg => arg.trim().split(/\s+/)[0]);

				console.log(functionString);
				console.log(argumentTypes);
				const isLinkedList = argumentTypes.includes("ListNode*");
				const isTree = argumentTypes.includes("TreeNode*");

				const functionName = functionString.match(/^\s*[\w<>*]+\s+([\w_]+)\s*\(/)?.[1];
				console.log(functionName);
				
				const returnType = (cltempSnippet[temi+1].split(' '))[0];
				// console.log(returnType);

				for(let i=temi;i<cltempSnippet.length-1;i++) cltempSnippet[i] = '    '+cltempSnippet[i];

				let codeSnippet = cltempSnippet.join('\n');

const headers = `#include <bits/stdc++.h>
using namespace std;
\n\n
`;

const print = `\n\n\n
// Helper function to print results
template <typename T>
void print(T&& t) {
    std::cout << t << endl;
}

int main(){
`;
const printBool = `\n\n\n
// Helper function to print boolean results
void print(T&& t) {
    if(t) std::cout << true << endl;
	else std::cout << false << endl;
}

int main(){
`;
const printVector = `\n\n\n
// Helper function to print results
template <typename T>
void print(const std::vector<T>&& vec) {
	std::cout << "[";
	for (int i=0;i<vec.size()-1;i++) {
        std::cout << vec[i] << ",";
	}
	std::cout << vec.back() ;
	std::cout << "]";
	std::cout << std::endl;
}

int main() {
	`;
const printNestedVector = `\n\n\n
// Helper function to print results
template <typename T>
void print(const std::vector<std::vector<T>>&& vec) {
	std::cout << "[";
	for (const auto& innerVec : vec) {
		std::cout << "[";
		for (int i=0;i<innerVec.size()-1;i++) {
            std::cout << innerVec[i] << ",";
		}
		std::cout << innerVec.back() ;
		std::cout << "]";
	}
	std::cout << "]";
	std::cout << std::endl;
}

int main() {
	`;
const defineLinkedList = `
// Definition for singly-linked list.
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};`
const printLinkedList = `\n\n\n
ListNode* linkedList_Input(const std::vector<int>&& vec) {
	ListNode *root = NULL;
    for (int i = vec.size()-1; i >= 0 ; i--){
		ListNode* temp = new ListNode(vec[i]);
		temp->next = root;
		root = temp;
	}
    return root;
}

// Helper function to print results
void print(ListNode* head) {
	std::cout << "[";
	ListNode* temp = head;
	while (temp->next != nullptr) {
		cout << temp->val << ",";
		temp = temp->next;
	}
	cout<<temp->val;
	std::cout << "]";
	std::cout << std::endl;
}

int main() {
	`;
const defineTree = `
//Definition for a binary tree node.
struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};`
const printTree = `\n\n\n
// Helper function to take input
TreeNode* Tree_Input(const std::vector<int>&& vec, int i=0) {
	TreeNode *root = nullptr;
	
	if (i < vec.size()) {
		root = newNode(vec[i]);

		// insert left child
		root->left = insertLevelOrder(vec, 2 * i + 1);

		// insert right child
		root->right = insertLevelOrder(vec, 2 * i + 2);
	}
	return root;
}

// Helper function to print results
void print(TreeNode* root) {
	std::cout << "[";
	if (root != NULL) {
		printTree(root->left);
		cout << root->data <<",";
		printTree(root->right);
	}
	std::cout << "]";
	std::cout << std::endl;
}

int main() {
	`;


				// let printFunction = '';
				if(returnType === "vector<int>" || returnType === "vector<string>"){
					codeSnippet = headers + codeSnippet + printVector;
					// printFunction = printVector;
				}
				else if(returnType === "vector<vector<int>>" || returnType === "vector<vector<string>>"){
					codeSnippet = headers + codeSnippet + printNestedVector;
					// printFunction = printNestedVector;
				}
				else if(isLinkedList){
					codeSnippet = headers + defineLinkedList + codeSnippet + printLinkedList;
					// printFunction = printLinkedList;
				}
				else if(isTree){
					codeSnippet = headers + defineTree + codeSnippet + printTree;
					// printFunction = printTree;
				}
				else if(returnType === "bool"){
					codeSnippet = headers + codeSnippet + printBool;
					// printFunction = printBool;
				}
				else if(["int", "float", "double", "string", "long", "long long"].includes(returnType)){
					codeSnippet = headers + codeSnippet + print;
				}
				else{
					codeSnippet = headers + codeSnippet + print;
				}

				let callingSnippet = "\n    Solution solution;";
				for(let i=0;i<inputExamples.length;i++){

					let tempfunc = '';
					for(let j=0;j<inputExamples[i].length;j++){
						let args = inputExamples[i][j];
						if(args[0] == '['){
							args = args.split("[").join("{");
							args = args.split("]").join("}");
						}
						// console.log(args);
						if(argumentTypes[j] == `ListNode*`){
							args = `linked_List_Input(`+args+`)`;
						}

						if(argumentTypes[j] == `TreeNode*`){
							args = `Tree_Input(`+args+`)`;
						}
						// console.log(args);
						tempfunc += args+",";
					}

					tempfunc = tempfunc.slice(0,-1);
					callingSnippet+=`\n    print(solution.${functionName}(${tempfunc}));`;
				}
				callingSnippet+=`\n}`;

				await writeToFile(filePath, codeSnippet+callingSnippet);
			}

			else{
				vscode.window.showWarningMessage("Please open a valid .cpp or .py file.");
			}

			async function writeToFile(url, content) {
				try {
					const uri = vscode.Uri.file(url);
					// Convert content to Uint8Array using TextEncoder
					const encoder = new TextEncoder();
					const encodedContent = encoder.encode(content);
					
					// Write to the file
					await vscode.workspace.fs.writeFile(uri, encodedContent);
					
					vscode.window.showInformationMessage('File written successfully!');
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to write to file: ${error.message}`);
				}
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('leetcode-helper-lh-.runTestCases', async ()=> {
			const ffff = vscode.window.activeTextEditor;
			const fileName = ffff? ffff.document.fileName :'';

			const parsedPath = path.parse(fileName);
			const fileNameWithoutExtension = parsedPath.name;
			let extFilePath;
			// console.log(fileName);
				
				
			if(fileName){
				const extensionName = path.extname(fileName);
			
				// const cppFile = path.join('c:', 'cp', 'temp.cpp'); 
				let command ='';
				if(extensionName === '.py'){
					extFilePath = ensureDirectoryAndFile(`${fileNameWithoutExtension}_py.txt`,"lph");
					command = `python "${fileName}"`;
				}
				else if(extensionName === '.cpp'){
					extFilePath = ensureDirectoryAndFile(`${fileNameWithoutExtension}_cpp.txt`,"lph");
					command = `g++ -std=c++17 -o "${fileName.replace(".cpp",'')}" "${fileName}" && "${fileName.replace(".cpp",'')}"`;
				}
				else{
					vscode.windows.showWarningMessage('open a valid cpp or py file');
					return;
				}

				
				async function getOutput(callback){
					return new Promise((resolve, reject) => {
						fs.readFile(extFilePath, 'utf8', (err, data) => {
							if (err) {
								vscode.window.showWarningMessage('Error reading file:', err);
								resolve('');
							} else {
								// Parse the string back into a JavaScript array
								try{
									// console.log(data);
									// return JSON.parse(data);
									resolve(JSON.parse(data));
								}
								catch{
									resolve('');
									// return null;
								}
								// console.log(outputExamples);
							}
						});
					});
				}
				let outputExamples = await getOutput();
				if(outputExamples && extensionName === ".py"){
					for(let i=0;i<outputExamples.length;i++){
						outputExamples[i] = JSON.stringify(outputExamples[i]);
					}
				}
				// console.log(outputExamples);
				// if(!outputExamples){
					// 	vscode.window.showWarningMessage("No output found. Fetch using LH:Fetch Test Cases Command");
					// 	return;
					// }
					
					
					function runCode(command) {
						return new Promise((resolve, reject) => {
							exec(command, (error, stdout, stderr) => {
								if (error) {
									// Reject the promise with the error and stderr
									reject({ tle: error.killed, error: error.message, stderr });
									return;
								}
								// Resolve the promise with stdout
								resolve({ stdout, stderr: null });
							});
						});
					}
					
					runCode(command)
					.then(({ stdout }) => {
						// console.log(stdout);
						const normalcodeOutput = stdout.split("\n");
						// console.log(Array.isArray(normalcodeOutput));
						normalcodeOutput.pop();
						// console.log(normalcodeOutput.map((str) => typeof str));
						const codeOutput = normalcodeOutput
						.map((str) => {
							try {
								return JSON.stringify(JSON.parse(str));
							} catch (err) {
								return str;
							}
						});
						for(let i=0;i<codeOutput.length;i++) codeOutput[i] = codeOutput[i].trim().replace(/[\r\n]/g, "");
						

						if(outputExamples.length == 0){
							vscode.window.showInformationMessage(`No output found to check. \n Code output:${stdout}`)
						}
						else if(codeOutput.length>0){
							let id = -1;
							for(let i=0;i<codeOutput.length;i++){
								// console.log(codeOutput[i]);
								// console.log(outputExamples[i]);
								if(codeOutput[i] != outputExamples[i]){
									id = i;
									break;
								}
							}
							if(id == -1){
								if(outputExamples.length == codeOutput.length) vscode.window.showInformationMessage("Accepted !!!");
								else vscode.window.showErrorMessage(`Wrong Answer at Test Case ${id+1}\nExpected:${outputExamples[codeOutput.length]} Found:' '`);
							}
							else{
								vscode.window.showErrorMessage(`Wrong Answer at Test Case ${id+1}\nExpected:${outputExamples[id]} Found:${codeOutput[id]}`);
							}
						}
						else{
							vscode.window.showErrorMessage(`Wrong Answer at Test Case 1\nExpected:${outputExamples[0]} Found:' '`);
						}
					})
					.catch(({ tle, error }) => {
						if(tle){
							vscode.window.showErrorMessage(`Time Limit Exceeded`);
						}
						else{
							vscode.window.showErrorMessage(error);
							console.log(error);
						}
					});
			}
			else{
				vscode.window.showErrorMessage('No file is available to execute');
			}
		})
	);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
