from fastapi.testclient import TestClient

def test_create_command(client: TestClient):
    # First create a macro
    macro_res = client.post("/macros", json={"name": "Parent Macro"})
    macro_id = macro_res.json()["id"]
    
    response = client.post("/commands", json={
        "name": "Test Command",
        "command": "ls -la",
        "ord": 1,
        "macro_id": macro_id
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Command"
    assert data["command"] == "ls -la"
    assert data["macro_id"] == macro_id

def test_get_commands_ordering(client: TestClient):
    client.post("/commands", json={"name": "Cmd 2", "command": "c2", "ord": 2})
    client.post("/commands", json={"name": "Cmd 1", "command": "c1", "ord": 1})
    
    response = client.get("/commands")
    data = response.json()
    names = [c["name"] for c in data]
    assert "Cmd 1" in names
    assert "Cmd 2" in names
    cmd1_idx = names.index("Cmd 1")
    cmd2_idx = names.index("Cmd 2")
    assert cmd1_idx < cmd2_idx

def test_update_command(client: TestClient):
    create_res = client.post("/commands", json={"name": "Old Cmd", "command": "old"})
    cmd_id = create_res.json()["id"]
    
    response = client.patch(f"/commands/{cmd_id}", json={"command": "new"})
    assert response.status_code == 200
    assert response.json()["command"] == "new"
    assert response.json()["name"] == "Old Cmd"

def test_delete_command(client: TestClient):
    create_res = client.post("/commands", json={"name": "Delete Me", "command": "rm"})
    cmd_id = create_res.json()["id"]
    
    client.delete(f"/commands/{cmd_id}")
    assert client.get(f"/commands/{cmd_id}").status_code == 404
