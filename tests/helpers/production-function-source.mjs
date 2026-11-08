import ts from "typescript";
export function functionSource(source,name){
 const ast=ts.createSourceFile("route.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 if(!node)throw Error("Missing production function: "+name);
 return node.getText(ast);
}
