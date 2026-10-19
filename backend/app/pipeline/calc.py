"""Arithmetic the writer states as a formula, evaluated here rather than trusted.

Only numbers, `x`, + - * / ** %, parentheses and a few math functions: no names, no calls
beyond the whitelist, no attributes.
"""

import ast
import math

FUNCTIONS = {
    "sqrt": math.sqrt, "log": math.log, "log10": math.log10, "log2": math.log2, "exp": math.exp,
    "abs": abs, "min": min, "max": max, "round": round, "floor": math.floor, "ceil": math.ceil,
}
CONSTANTS = {"pi": math.pi, "e": math.e}
OPERATORS = {
    ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b, ast.Pow: lambda a, b: a ** b, ast.Mod: lambda a, b: a % b,
    ast.FloorDiv: lambda a, b: a // b,
}


class FormulaError(ValueError):
    pass


def evaluate(formula: str, x: float) -> float:
    """Value of `formula` (a Python-style expression of x) at x."""
    if len(formula) > 300:
        raise FormulaError("formula too long")
    try:
        tree = ast.parse(formula.replace("^", "**"), mode="eval")
    except SyntaxError as e:
        raise FormulaError(f"not an expression: {e.msg}") from e

    def ev(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        if isinstance(node, ast.Name):
            if node.id == "x":
                return x
            if node.id in CONSTANTS:
                return CONSTANTS[node.id]
            raise FormulaError(f"unknown name '{node.id}' (only x is allowed)")
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = ev(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.BinOp) and type(node.op) in OPERATORS:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 1000:
                raise FormulaError("exponent too large")
            return OPERATORS[type(node.op)](left, right)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCTIONS and not node.keywords:
            return FUNCTIONS[node.func.id](*(ev(a) for a in node.args))
        raise FormulaError(f"unsupported syntax: {ast.dump(node)[:60]}")

    try:
        value = float(ev(tree))
    except (ArithmeticError, TypeError, ValueError) as e:
        if isinstance(e, FormulaError):
            raise
        raise FormulaError(f"cannot compute at x={x}: {e}") from e
    if not math.isfinite(value):
        raise FormulaError(f"not finite at x={x}")
    return value


def close(stated: float, computed: float) -> bool:
    """Stated value matches the computed one, allowing for sensible rounding."""
    return abs(stated - computed) <= max(0.03 * abs(computed), 0.5 if abs(computed) >= 10 else 0.01)
