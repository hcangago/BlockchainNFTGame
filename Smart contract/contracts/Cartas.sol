// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract Cartas is ERC721Enumerable, Ownable {
    using Strings for uint256;

    uint256 public nextTokenId;
    string private _baseTokenURI;

    mapping(uint256 => uint256) public bichoAsignado;

    constructor() ERC721("EtherBeasts", "EBST") Ownable(msg.sender) {
        _baseTokenURI = "ipfs://bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq/";
    }

    function ganarCarta(address jugador) public {
        uint256 bichoAleatorio = (uint256(
            keccak256(
                abi.encodePacked(block.timestamp, msg.sender, nextTokenId)
            )
        ) % 16) + 1;

        bichoAsignado[nextTokenId] = bichoAleatorio;

        _safeMint(jugador, nextTokenId);
        nextTokenId++;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256 bichoId = bichoAsignado[tokenId];
        return
            string(abi.encodePacked(_baseURI(), bichoId.toString(), ".json"));
    }

    function setBaseURI(string memory nuevaURI) public onlyOwner {
        _baseTokenURI = nuevaURI;
    }
}
