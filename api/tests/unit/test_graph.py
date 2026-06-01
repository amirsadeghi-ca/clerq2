import pytest

from app.engine.scheduler import GraphError, validate_graph
from tests.helpers import e, make_def, n


def test_topological_order():
    order, _ = validate_graph(make_def([n("a"), n("b"), n("c")],
                                       [e("a", "b"), e("b", "c")]))
    assert [x["id"] for x in order] == ["a", "b", "c"]


def test_fan_out_join_orders_parents_before_child():
    order, _ = validate_graph(make_def(
        [n("a"), n("b"), n("c"), n("d")],
        [e("a", "b"), e("a", "c"), e("b", "d"), e("c", "d")]))
    ids = [x["id"] for x in order]
    assert ids.index("a") < ids.index("b") < ids.index("d")
    assert ids.index("c") < ids.index("d")


def test_empty_graph_raises():
    with pytest.raises(GraphError):
        validate_graph(make_def([]))


def test_cycle_raises():
    with pytest.raises(GraphError):
        validate_graph(make_def([n("a"), n("b")], [e("a", "b"), e("b", "a")]))


def test_unknown_node_type_raises():
    with pytest.raises(GraphError):
        validate_graph(make_def([n("a", "no_such_type")]))


def test_dangling_edge_is_skipped():
    order, _ = validate_graph(make_def(
        [n("a"), n("b")], [e("a", "b"), e("a", "ghost"), e("ghost", "b")]))
    assert {x["id"] for x in order} == {"a", "b"}
