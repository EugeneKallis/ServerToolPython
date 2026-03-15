from fastapi.testclient import TestClient

def test_create_macro(client: TestClient):
    # First create a group
    group_res = client.post("/macro-groups", json={"name": "Parent Group"})
    group_id = group_res.json()["id"]
    
    response = client.post("/macros", json={
        "name": "Test Macro", 
        "ord": 1,
        "macro_group_id": group_id
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Macro"
    assert data["macro_group_id"] == group_id

def test_get_macros_ordering(client: TestClient):
    client.post("/macros", json={"name": "Macro 2", "ord": 2})
    client.post("/macros", json={"name": "Macro 1", "ord": 1})
    
    response = client.get("/macros")
    data = response.json()
    # Check that we have at least these two
    names = [m["name"] for m in data]
    assert "Macro 1" in names
    assert "Macro 2" in names
    # Ensure relative order if they are adjacent or among the results
    macro1_idx = names.index("Macro 1")
    macro2_idx = names.index("Macro 2")
    assert macro1_idx < macro2_idx

def test_update_macro(client: TestClient):
    create_res = client.post("/macros", json={"name": "Old Macro"})
    macro_id = create_res.json()["id"]
    
    response = client.patch(f"/macros/{macro_id}", json={"name": "New Macro"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Macro"

def test_delete_macro(client: TestClient):
    create_res = client.post("/macros", json={"name": "To Delete"})
    macro_id = create_res.json()["id"]
    
    client.delete(f"/macros/{macro_id}")
    assert client.get(f"/macros/{macro_id}").status_code == 404
