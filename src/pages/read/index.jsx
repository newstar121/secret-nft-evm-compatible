import { Link } from "react-router-dom";
import { CODE_HASH, CONTRACT_ADDRESS, PRIVATE_METADATA, PUBLIC_METADATA } from "../../env";
import './style.css';
import { useKeplrWalletConnect } from "../../hooks/keplrWalletConnect";
import { useMetamaskWalletConnect } from "../../hooks/metamaskWalletConnect";
import toast from "react-hot-toast";
import { MsgExecuteContract } from "secretjs";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCircleNotch, faWarning } from "@fortawesome/free-solid-svg-icons"
import axios from 'axios';
import myContract from '../../ethercontract';
// import Web3 from 'web3';  

// let provider = window.ethereum;
// const web3 = new Web3(provider);
// const accounts = await web3.eth.getAccounts();

const ReadPage = () => {

  const [loading, setLoading] = useState(false)
  const { secretClient, wallet } = useKeplrWalletConnect();
  const { ethereumClient, metamaskWallet } = useMetamaskWalletConnect();
  const [nftList, setNftList] = useState([]);
  const [ether_nfts, setEtherNftList] = useState([]);
  const [burnResult, setBurnResult] = useState(null);
  const [sendInfo, setSendInfo] = useState(null);

  const getOwnedNFTs = async () => {
    setLoading(true);
    try {
      let tokens = await secretClient.query.snip721.GetOwnedTokens({
        contract: {
          address: CONTRACT_ADDRESS,
          codeHash: CODE_HASH
        },
        owner: wallet,
        auth: {
          viewer: {
            viewing_key: wallet,
            address: wallet
          }
        }
      });

      if (tokens?.token_list) {
        let nftList = [];
        for (const token_id of tokens.token_list.tokens) {
          const nftInfo = await secretClient.query.compute.queryContract({
            contract_address: CONTRACT_ADDRESS,
            code_hash: CODE_HASH,
            query: {
              nft_info: {
                token_id: token_id
              }
            }
          });
          if (nftInfo.nft_info.extension == null) continue;
          nftList = [...nftList, { token_id: token_id, visibleText: nftInfo.nft_info.extension?.attributes[0].value }];
        }
        setNftList(nftList)
      } else {
        setNftList([]);
      }
    } catch (e) {
      toast.error(e.message);
      console.log('error >>>', e);
    }
    setLoading(false);
  }

  const getOwnedEthereumNFTs = async () => {
    setLoading(true);
    try {
      const totalNFTs = await myContract.methods.balanceOf(metamaskWallet).call();
      console.log(totalNFTs);
      const parsedTotalNFTs = Number(totalNFTs);
      
      let i = 0 , temp_toke_id = 0, temp_token_uri, visible_text = "";
      const ether_nfts = [];
      while (i < parsedTotalNFTs) {
        temp_toke_id = await myContract.methods.tokenOfOwnerByIndex(metamaskWallet, i).call();
        temp_token_uri = await myContract.methods.tokenURI(temp_toke_id).call();
        visible_text =  temp_token_uri.split("####")[0];  
        temp_token_uri =  temp_token_uri.split("####")[1];

        const response = await axios.post('https://app.goldstar.icu/sendFromEvm', { temp_token_uri });      
        if( response && response.data && response.data.decryptedText ){
          temp_token_uri = response.data.decryptedText;
        }

        ether_nfts.push({"token_id" : Number(temp_toke_id), "token_uri" : visible_text, "hidden_text" : temp_token_uri});
        i += 1;
      }
      console.log(ether_nfts);
      setEtherNftList(ether_nfts);
    } catch (e) {
      toast.error(e.message);
      console.log('error >>>', e);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (wallet && secretClient) {
      getOwnedNFTs();
      if( !metamaskWallet ){
        setEtherNftList([]);
      }
    } else if(metamaskWallet && ethereumClient){
      getOwnedEthereumNFTs();
      if( !wallet ){
        setNftList([]);
      }
    }
    else {
      setNftList([]);
      setEtherNftList([]);
    }
  }, [wallet, secretClient, metamaskWallet, ethereumClient]);

  const onClickReadAndDestroy = async (token_id, visibleText, isEvm, hiddentext = "") => {
    let loading = null;
    try {
      if( isEvm == false){
        const nftInfo = await secretClient.query.compute.queryContract({
          contract_address: CONTRACT_ADDRESS,
          code_hash: CODE_HASH,
          query: {
            private_metadata: {
              token_id: token_id,
              viewer: {
                address: wallet,
                viewing_key: wallet
              }
            }
          }
        });
        loading = toast.loading("Burning...");
        const burnMsg = new MsgExecuteContract({
          sender: wallet,
          contract_address: CONTRACT_ADDRESS,
          code_hash: CODE_HASH, // optional but way faster
          msg: {
            burn_nft: {
              token_id: token_id
            },
          },
        });
        const tx = await secretClient.tx.broadcast([burnMsg], {
          // gasLimit: Math.ceil(sim.gas_info.gas_used * 1.1),
          gasLimit: 300_000,
        });
  
        toast.dismiss(loading)
        toast.success("Burned successfully")
  
        console.log('tx >>> ', tx);
        setBurnResult({
          token_id: token_id,
          hidden_text: nftInfo.private_metadata.extension?.attributes[0].value,
          visible_text: visibleText,
          txHash: tx.transactionHash
        });
        let cloneList = JSON.parse(JSON.stringify(nftList));
        cloneList = cloneList.filter((nft) => nft.token_id != token_id);
        setNftList(cloneList);
      }
      else {
        toast.dismiss(loading)
        const result = await myContract.methods.burn(token_id).send({
          from: metamaskWallet
        });
        toast.success("Burned successfully")
        setBurnResult({
          token_id: token_id,
          hidden_text: hiddentext,
          visible_text: visibleText
        });
        let cloneList = JSON.parse(JSON.stringify(ether_nfts));
        cloneList = cloneList.filter((nft) => nft.token_id != token_id);
        setEtherNftList(cloneList);
      }
    } catch (e) {
      if (loading)
        toast.dismiss(loading)
      toast.error(e.message);
      console.log(e);
    }
  }

  const onClickSend = (token_id) => {
    setSendInfo({
      token_id: token_id,
      recipient: '',
      type: 'send',
    });
  }

  const onClickConvert = (token_id, isEvm, visible_text = "", hidden_text = "") => {
    setSendInfo({
      token_id: token_id,
      recipient: '',
      type: 'convert',
      isEvm: isEvm,
      visible_text: visible_text,
      hidden_text: hidden_text,
    });
  }

  const onClickSendNFT = async () => {
    if (sendInfo == null || sendInfo.recipient === '')
      return;
    let loading = null;
    try {
      loading = toast.loading("Sending...");
      const sendMsg = new MsgExecuteContract({
        sender: wallet,
        contract_address: CONTRACT_ADDRESS,
        code_hash: CODE_HASH, // optional but way faster
        msg: {
          transfer_nft: {
            recipient: sendInfo.recipient,
            token_id: sendInfo.token_id
          },
        },
      });
      const tx = await secretClient.tx.broadcast([sendMsg], {
        // gasLimit: Math.ceil(sim.gas_info.gas_used * 1.1),
        gasLimit: 300_000,
      });

      toast.dismiss(loading)
      toast.success("Sent successfully")

      console.log('tx >>> ', tx);
      let cloneList = JSON.parse(JSON.stringify(nftList));
      cloneList = cloneList.filter((nft) => nft.token_id != sendInfo.token_id);
      setNftList(cloneList);
      setSendInfo(null);
    } catch (e) {
      if (loading)
        toast.dismiss(loading)
      toast.error(e.message);
      console.log(e);
    }
  }
  
  const onClickConvertNFTToSecret = async () => {
    if (sendInfo == null)
      return;
    let loading = null;
    try {
      loading = toast.loading("Converting...");
      const result = await myContract.methods.burn(sendInfo.token_id).send({
        from: metamaskWallet
      });

      let privateMetadata = PRIVATE_METADATA;
      let publicMetadata = PUBLIC_METADATA;

      privateMetadata.extension.attributes[0].value = sendInfo.hidden_text;
      publicMetadata.extension.attributes[0].value = sendInfo.visible_text;

      const mintMsg = new MsgExecuteContract({
        sender: wallet,
        contract_address: CONTRACT_ADDRESS,
        code_hash: CODE_HASH, // optional but way faster
        msg: {
          mint_nft: {
            owner: wallet,
            public_metadata: publicMetadata,
            private_metadata: privateMetadata,
          },
        },
      });

      const tx = await secretClient.tx.broadcast([mintMsg], {
        // gasLimit: Math.ceil(sim.gas_info.gas_used * 1.1),
        gasLimit: 300_000,
      });
      toast.dismiss(loading)
      if (tx.code == 0) {
        toast.success("Converted successfully")
      } else {
        toast.error("Converted failed")
      }
      
      console.log('tx >>> ', tx);
      let cloneList = JSON.parse(JSON.stringify(ether_nfts));
      cloneList = cloneList.filter((nft) => nft.token_id != sendInfo.token_id);
      getOwnedNFTs();
      setEtherNftList(cloneList);
      setSendInfo(null);
    } catch (e) {
      if (loading)
        toast.dismiss(loading)
      toast.error(e.message);
      console.log(e);
    }
  }

  const onClickConvertNFT = async () => {
    if (sendInfo == null)
      return;
    let loading = null;
    try {
      loading = toast.loading("Converting...");
      const nftInfo_public = await secretClient.query.compute.queryContract({
        contract_address: CONTRACT_ADDRESS,
        code_hash: CODE_HASH,
        query: {
          nft_info: {
            token_id: sendInfo.token_id,
          }
        }
      });

      const nftInfo_private = await secretClient.query.compute.queryContract({
        contract_address: CONTRACT_ADDRESS,
        code_hash: CODE_HASH,
        query: {
          private_metadata: {
            token_id: sendInfo.token_id,
            viewer: {
              address: wallet,
              viewing_key: wallet
            }
          }
        }
      });

      const sendMsg = new MsgExecuteContract({
        sender: wallet,
        contract_address: CONTRACT_ADDRESS,
        code_hash: CODE_HASH, // optional but way faster
        msg: {
          burn_nft: {
            token_id: sendInfo.token_id,
          },
        },
      });

      const tx = await secretClient.tx.broadcast([sendMsg], {
        // gasLimit: Math.ceil(sim.gas_info.gas_used * 1.1),
        gasLimit: 300_000,
      });
      
      const hidden_text = nftInfo_private.private_metadata.extension?.attributes[0].value;
      let visible_text = nftInfo_public.nft_info.extension?.attributes[0].value;

      const response = await axios.post('https://app.goldstar.icu/sendFromScrt', { hidden_text });
      
      if( response && response.data && response.data.encrpytedText ){
        visible_text += "####";
        visible_text += response.data.encrpytedText;
      }

      // const owner = await myContract.methods.owner().call();
      console.log(visible_text);
      const owner = await myContract.methods.safeMint(metamaskWallet, sendInfo.token_id , visible_text).send({
        from: metamaskWallet
      });
  
      // setBurnResult({
      //   token_id: sendInfo.token_id,
      //   hidden_text: nftInfo_private.private_metadata.extension?.attributes[0].value,
      //   visible_text: nftInfo_public.nft_info.extension?.attributes[0].value,
      //   txHash: tx.transactionHash
      // });

      toast.dismiss(loading)
      toast.success("Sent successfully")

      console.log('tx >>> ', tx);
      let cloneList = JSON.parse(JSON.stringify(nftList));
      cloneList = cloneList.filter((nft) => nft.token_id != sendInfo.token_id);
      getOwnedEthereumNFTs();
      setNftList(cloneList);
      setSendInfo(null);
    } catch (e) {
      if (loading)
        toast.dismiss(loading)
      toast.error(e.message);
      console.log(e);
    }
  }

  const onChangeRecipient = (e) => {
    let newSendInfo = JSON.parse(JSON.stringify(sendInfo));
    newSendInfo.recipient = e.target.value;
    setSendInfo(newSendInfo);
  }

  const getNftItem = (nft) => {
    return (
      <div className="flex flex-col justify-center w-full gap-1 mx-auto">
        <p className="text-xl font-semibold text-left">{`ID: ${nft.token_id}`} &nbsp; SCRT</p>
        <div className="flex flex-row items-center ml-5 w-fit">
          <p className="text-xl font-semibold">Visible Text: &nbsp;</p>
          <p className="text-xl font-semibold">{`${nft.visibleText}`}</p>
        </div>
        <div className="flex flex-row items-center ml-5 w-fit">
          <p className="text-xl font-semibold">Hidden Text: &nbsp;</p>
          <p className="text-xl font-semibold underline cursor-pointer" onClick={() => onClickReadAndDestroy(nft.token_id, nft.visibleText, false)}>Read & Destroy NFT</p>
        </div>
        <div className="flex flex-row items-center gap-2 ml-5 w-fit">
          {/* <input className="p-1 text-lg text-black border-2 border-solid rounded-md color-primary min-w-96 border-primary" value={sendAddress} onChange={(e) => setSendAddress(e.target.value)}></input> */}
          <div className="w-[117px]"></div>
          <p className="text-xl font-semibold underline cursor-pointer" onClick={() => onClickSend(nft.token_id)}>Send</p>
          <p className="text-xl font-semibold underline cursor-pointer" onClick={() => onClickConvert(nft.token_id, true)}>Convert to EVM</p>
        </div>
      </div>
    )
  }

  const getEtherNftItem = (nft) => {
    return (
      <div className="flex flex-col justify-center w-full gap-1 mx-auto">
        <p className="text-xl font-semibold text-left">{`ID: ${nft.token_id}`} &nbsp; BNB</p>
        <div className="flex flex-row items-center ml-5 w-fit">
          <p className="text-xl font-semibold">Visible Text: &nbsp;</p>
          <p className="text-xl font-semibold">{`${nft.token_uri}`}</p>
        </div>
        <div className="flex flex-row items-center ml-5 w-fit">
          <p className="text-xl font-semibold">Hidden Text: &nbsp;</p>
          <p className="text-xl font-semibold underline cursor-pointer" onClick={() => onClickReadAndDestroy(nft.token_id, nft.token_uri, true, nft.hidden_text)}>Read & Destroy NFT</p>
        </div>
        <div className="flex flex-row items-center gap-2 ml-5 w-fit">
          {/* <input className="p-1 text-lg text-black border-2 border-solid rounded-md color-primary min-w-96 border-primary" value={sendAddress} onChange={(e) => setSendAddress(e.target.value)}></input> */}
          <div className="w-[117px]"></div>
          <p className="text-xl font-semibold underline cursor-pointer" onClick={() => onClickSend(nft.token_id)}>Send</p>
          <p className="text-xl font-semibold underline cursor-pointer" onClick={() => onClickConvert(nft.token_id, false, nft.token_uri, nft.hidden_text)}>Convert to Secret</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {burnResult == null && sendInfo === null && (
        <>
          <p className="text-2xl font-semibold">Contract</p>
          <Link to={`https://testnet.ping.pub/secret/account/${CONTRACT_ADDRESS}`} target={'_blank'} className="text-xl font-semibold underline">{CONTRACT_ADDRESS}</Link>

          {(wallet == null || secretClient == null) && (
            <p className="mt-40 text-4xl font-semibold">Please connect Keplr wallet</p>
          )}
           {(metamaskWallet == null || ethereumClient == null) && (
            <p className="mt-40 text-4xl font-semibold">Please connect Metamask wallet</p>
          )}
          {loading && (
            <div className="Loading"><FontAwesomeIcon icon={faCircleNotch} spin /></div>
          )}
          {!loading && (
            <div className="flex flex-col gap-6 min-w-1/3">
              {nftList && nftList.length > 0 && nftList.map(getNftItem)}
              {ether_nfts && ether_nfts.length > 0 && ether_nfts.map(getEtherNftItem)}
            </div>
          )}
        </>
      )}

      {burnResult == null && sendInfo !== null && (
        <>
          <p className="text-2xl font-semibold">Contract</p>
          <Link to={`https://testnet.ping.pub/secret/account/${CONTRACT_ADDRESS}`} target={'_blank'} className="text-xl font-semibold underline">{CONTRACT_ADDRESS}</Link>

          {(sendInfo.type !== null && sendInfo.type == "send") && (
            <div className="flex flex-col gap-1 mt-3">
              <p className="text-lg">Recipient Address:</p>
              <input className="p-2 text-black border-2 border-solid rounded-md color-primary min-w-96 border-primary" value={sendInfo.recipient} onChange={onChangeRecipient}></input>
            </div>
          )
          }
          {(sendInfo.type !== null && sendInfo.type == "send") && (
            <button className="px-20 SendButton" onClick={onClickSendNFT}>Send</button>
          ) || ((sendInfo.isEvm !== null && sendInfo.isEvm == true) && ( 
            <button className="px-20 SendButton" onClick={onClickConvertNFT}>Convert to EVM</button>
          ) || ( 
            <button className="px-20 SendButton" onClick={onClickConvertNFTToSecret}>Convert to Secret</button>
          ))
          }          
          <p className="mt-3 text-xl font-semibold underline cursor-pointer" onClick={() => setSendInfo(null)}>Return to NFT List</p>
        </>
      )}

      {burnResult != null && (
        <div className="flex flex-col items-center gap-5 mt-10">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon className="h-7" icon={faWarning} />
            <p className="text-3xl font-bold">{`NFT ID: ${burnResult.token_id} HAS BEEN DESTROYED!`}</p>
          </div>
          <p className="text-2xl font-semibold">Tx ID: <Link className="underline" target="_blank" to={`https://testnet.ping.pub/secret/tx/${burnResult.txHash}`}>PingHub</Link></p>
          <div className="flex flex-col justify-center gap-1 p-4 mx-auto mt-10 border-2 border-solid rounded-md w-fit border-primary">
            <p className="text-2xl font-semibold text-left">{`ID: ${burnResult.token_id}`}</p>
            <div className="flex flex-row items-center ml-5 w-fit">
              <p className="text-2xl font-semibold">Visible Text: &nbsp;</p>
              <p className="text-2xl font-semibold">{`${burnResult.visible_text}`}</p>
            </div>
            <div className="flex flex-row items-center ml-5 w-fit">
              <p className="text-2xl font-semibold">Hidden Text: &nbsp;</p>
              <p className="text-2xl font-semibold">{`${burnResult.hidden_text}`}</p>
            </div>
          </div>
          <p className="mt-3 text-xl font-semibold underline cursor-pointer" onClick={() => setBurnResult(null)}>Return to NFT List</p>
          {/* <Link to={`https://testnet.ping.pub/secret/account/${CONTRACT_ADDRESS}`} target={'_blank'} className="text-xl font-semibold underline">{CONTRACT_ADDRESS}</Link> */}
        </div>
      )}

      {/* <div className="flex flex-col gap-1 mt-10">
        <p className="text-lg">Visible text:</p>
        <input className="p-2 text-black border-2 border-solid rounded-md min-w-96 border-primary" value={visibleText} onChange={(e) => setVisibleText(e.target.value)}></input>
      </div>

      <div className="flex flex-col gap-1 mt-3">
        <p className="text-lg">Hidden text:</p>
        <input className="p-2 text-black border-2 border-solid rounded-md min-w-96 border-primary" value={maskedValue} onChange={onChangeHiddenText}></input>
      </div>

      <button className="px-20 MintButton" onClick={onClickMint}>Mint</button> */}

    </div>
  )
}

export default ReadPage;
